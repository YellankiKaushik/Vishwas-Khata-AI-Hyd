"""Repayment expectation API. The existing journal remains the source of balances."""
from datetime import date, datetime, timedelta
import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from pydantic import Field, StrictBool, field_validator

from .config import utc_text
from .db import transaction
from .domain import DomainError, audit, customer, fingerprint, uid
from .hyd_evidence import commitment_view, due_items, ledger_view, owned_commitment, scope, snapshot
from .hyd_models import CommitmentEvents, CommitmentList, CommitmentResponse, DueList, error_responses
from .limits import Quota
from .models import ConfirmDraft, Money, StrictModel, Version

Identifier = Annotated[str, Field(min_length=1, max_length=128)]
Digest = Annotated[str, Field(pattern=r'^[0-9a-f]{64}$')]
Reason = Annotated[str, Field(min_length=3, max_length=240)]
OperationID = Annotated[str, Header(alias='Client-Operation-Id', min_length=8, max_length=128)]
CommitmentID = Annotated[str, Path(min_length=1, max_length=128)]


class Expectation(StrictModel):
    expected_date: str
    promised_amount_paise: Money | None = None
    reason: Reason
    note: Annotated[str | None, Field(max_length=240)] = None

    @field_validator('expected_date', mode='before')
    @classmethod
    def calendar_date(cls, value):
        if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
            raise ValueError('Use an exact YYYY-MM-DD date')
        date.fromisoformat(value)
        return value

class CreateCommitment(Expectation):
    customer_id: Identifier
    reviewed_ledger_hash: Digest | None = None


class EditCommitment(Expectation):
    expected_version: Version
    review_latest_ledger: StrictBool
    reviewed_ledger_hash: Digest | None = None

    @field_validator('review_latest_ledger')
    @classmethod
    def explicit_review(cls, value):
        return ConfirmDraft.explicit(value)


class CloseCommitment(ConfirmDraft):
    reason: Reason

def review_balance(ledger, amount, reviewed_hash):
    if reviewed_hash is not None and reviewed_hash != ledger['ledger_hash']:
        raise DomainError('STALE_EVIDENCE', 'The ledger changed. Refresh and review the current balance.', 409)
    if ledger['outstanding_paise'] <= 0:
        raise DomainError('NO_OUTSTANDING_BALANCE', 'A positive recorded balance is required.', 409)
    if amount is not None and amount > ledger['outstanding_paise']:
        raise DomainError('INVALID_AMOUNT', 'The promised amount exceeds the current recorded balance.')


def receipt_response(payload, action):
    return Response(payload, status_code=201 if action == 'CREATE' else 200, media_type='application/json')


def mutate(request, merchant_id, operation_id, body, action, quota, commitment_id=None):
    app = request.app
    settings = app.state.settings
    digest = fingerprint([action, commitment_id, body.model_dump(mode='json', exclude_unset=True)])
    with transaction(settings.database_path) as connection:
        saved = connection.execute(
            '''SELECT request_hash,response_json FROM commitment_operation_receipts
               WHERE merchant_id=? AND operation_id=?''',
            (merchant_id, operation_id),
        ).fetchone()
        if saved:
            if saved['request_hash'] != digest:
                raise DomainError('IDEMPOTENCY_KEY_REUSE', 'This operation ID already has different details.', 409)
            return receipt_response(saved['response_json'], action)

        quota.take(merchant_id, 'commitment', 20)
        now = settings.now()
        actor_id = 'local-demo-merchant'
        if action == 'CREATE':
            customer(connection, merchant_id, body.customer_id)
            ledger = ledger_view(connection, merchant_id, body.customer_id)
            review_balance(ledger, body.promised_amount_paise, body.reviewed_ledger_hash)
            active = connection.execute(
                "SELECT 1 FROM repayment_commitments WHERE merchant_id=? AND customer_id=? AND state='ACTIVE'",
                (merchant_id, body.customer_id),
            ).fetchone()
            if active:
                raise DomainError('ACTIVE_COMMITMENT_EXISTS', 'This customer already has an active commitment.', 409)
            commitment_id, stamp = uid('cmt'), utc_text(now)
            connection.execute(
                '''INSERT INTO repayment_commitments
                   (id,merchant_id,customer_id,expected_date,promised_amount_paise,last_reviewed_ledger_hash,
                    state,version,actor_id,last_reason,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,'ACTIVE',1,?,?,?,?)''',
                (commitment_id, merchant_id, body.customer_id, body.expected_date, body.promised_amount_paise,
                 ledger['ledger_hash'], actor_id, body.reason, stamp, stamp),
            )
        else:
            row = owned_commitment(connection, merchant_id, commitment_id)
            if row['version'] != body.expected_version:
                raise DomainError('VERSION_CONFLICT', 'Refresh and review the current commitment version.', 409)
            if row['state'] != 'ACTIVE':
                raise DomainError('COMMITMENT_CLOSED', 'This commitment is already closed.', 409)
            stamp = utc_text(max(now, datetime.fromisoformat(row['updated_at']) + timedelta(microseconds=1)))
            expected_date, promised = row['expected_date'], row['promised_amount_paise']
            reviewed_hash = row['last_reviewed_ledger_hash']
            if action == 'UPDATE':
                customer(connection, merchant_id, row['customer_id'])
                ledger = ledger_view(connection, merchant_id, row['customer_id'])
                expected_date = body.expected_date
                if 'promised_amount_paise' in body.model_fields_set:
                    promised = body.promised_amount_paise
                review_balance(ledger, promised, body.reviewed_ledger_hash or row['last_reviewed_ledger_hash'])
                reviewed_hash = ledger['ledger_hash']
            connection.execute(
                '''UPDATE repayment_commitments SET expected_date=?,promised_amount_paise=?,
                   last_reviewed_ledger_hash=?,state=?,version=version+1,actor_id=?,last_reason=?,updated_at=?
                   WHERE merchant_id=? AND id=? AND version=?''',
                (expected_date, promised, reviewed_hash, 'ACTIVE' if action == 'UPDATE' else action,
                 actor_id, body.reason, stamp, merchant_id, commitment_id, body.expected_version),
            )

        app.state.fault_injector('after_commitment_event')
        result = commitment_view(connection, owned_commitment(connection, merchant_id, commitment_id), now)
        CommitmentResponse.model_validate(result)
        payload = json.dumps(result, ensure_ascii=False, separators=(',', ':'))
        connection.execute(
            '''INSERT INTO commitment_operation_receipts
               (merchant_id,operation_id,event_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)''',
            (merchant_id, operation_id, result['event_id'], digest, payload, stamp),
        )
        app.state.fault_injector('after_commitment_receipt')
        metadata = {'version': result['version'], 'event_id': result['event_id']}
        if action in ('CREATE', 'UPDATE') and body.note:
            metadata['note'] = body.note
        audit(connection, merchant_id, 'COMMITMENT_' + action, 'commitment', commitment_id,
              request.state.request_id, stamp, metadata)
        app.state.fault_injector('after_commitment_audit')
    return receipt_response(payload, action)


def commitment_router(settings, merchant):
    router = APIRouter(tags=['Hyderabad commitments'], responses=error_responses(400, 401, 403, 413, 422, 503))
    quota = Quota('QUOTA_EXCEEDED', 'Commitment request limit reached. Wait a minute and retry.')
    write_errors = error_responses(404, 409, 429)
    missing = error_responses(404)

    @router.post('/v1/commitments', status_code=201, operation_id='hydV3CreateCommitment',
                 response_model=CommitmentResponse, responses=write_errors)
    def create(body: CreateCommitment, request: Request, operation_id: OperationID, mid=Depends(merchant)):
        return mutate(request, mid, operation_id, body, 'CREATE', quota)

    @router.get('/v1/commitments', operation_id='hydV3ListCommitments', response_model=CommitmentList, responses=missing)
    def list_commitments(customer_id: str | None = Query(None, max_length=128),
                         limit: int = Query(20, ge=1, le=50), cursor: str | None = Query(None, max_length=256),
                         mid=Depends(merchant)):
        now = settings.now()
        with snapshot(settings.database_path) as connection:
            previous = owned_commitment(connection, mid, cursor) if cursor else None
            if previous and customer_id is not None and previous['customer_id'] != customer_id:
                raise DomainError('NOT_FOUND', 'Commitment unavailable in this shop.', 404)
            stamp = previous['created_at'] if previous else None
            rows = connection.execute(
                '''SELECT * FROM repayment_commitments WHERE merchant_id=? AND (? IS NULL OR customer_id=?)
                   AND (? IS NULL OR created_at<? OR (created_at=? AND id>?))
                   ORDER BY created_at DESC,id LIMIT ?''',
                (mid, customer_id, customer_id, stamp, stamp, stamp, cursor, limit + 1),
            ).fetchall()
            return {**scope(now), 'items': [commitment_view(connection, row, now) for row in rows[:limit]],
                    'next_cursor': rows[limit - 1]['id'] if len(rows) > limit else None}

    @router.get('/v1/commitments/{commitment_id}', operation_id='hydV3GetCommitment',
                response_model=CommitmentResponse, responses=missing)
    def detail(commitment_id: CommitmentID, mid=Depends(merchant)):
        with snapshot(settings.database_path) as connection:
            return commitment_view(connection, owned_commitment(connection, mid, commitment_id), settings.now())

    @router.patch('/v1/commitments/{commitment_id}', operation_id='hydV3UpdateCommitment',
                  response_model=CommitmentResponse, responses=write_errors)
    def edit(commitment_id: CommitmentID, body: EditCommitment, request: Request, operation_id: OperationID,
             mid=Depends(merchant)):
        return mutate(request, mid, operation_id, body, 'UPDATE', quota, commitment_id)

    @router.post('/v1/commitments/{commitment_id}/cancel', operation_id='hydV3CancelCommitment',
                 response_model=CommitmentResponse, responses=write_errors)
    def cancel(commitment_id: CommitmentID, body: CloseCommitment, request: Request, operation_id: OperationID,
               mid=Depends(merchant)):
        return mutate(request, mid, operation_id, body, 'CANCELLED', quota, commitment_id)

    @router.post('/v1/commitments/{commitment_id}/handle', operation_id='hydV3MarkCommitmentHandled',
                 response_model=CommitmentResponse, responses=write_errors)
    def handle(commitment_id: CommitmentID, body: CloseCommitment, request: Request, operation_id: OperationID,
               mid=Depends(merchant)):
        return mutate(request, mid, operation_id, body, 'HANDLED', quota, commitment_id)

    @router.get('/v1/commitments/{commitment_id}/events', operation_id='hydV3CommitmentHistory',
                response_model=CommitmentEvents, responses=missing)
    def events(commitment_id: CommitmentID, limit: int = Query(50, ge=1, le=100),
               after_version: int = Query(0, ge=0), mid=Depends(merchant)):
        with snapshot(settings.database_path) as connection:
            owned_commitment(connection, mid, commitment_id)
            rows = connection.execute(
                '''SELECT id,commitment_id,event_type,previous_version,new_version,previous_snapshot_json,
                          new_snapshot_json,reason,created_at,actor_id FROM commitment_events
                   WHERE merchant_id=? AND commitment_id=? AND new_version>? ORDER BY new_version LIMIT ?''',
                (mid, commitment_id, after_version, limit + 1),
            ).fetchall()
            items = []
            for row in rows[:limit]:
                item = dict(row)
                for key in ('previous_snapshot', 'new_snapshot'):
                    value = item.pop(key + '_json')
                    item[key] = json.loads(value) if value is not None else None
                items.append(item)
            return {'items': items, 'next_after_version': items[-1]['new_version'] if len(rows) > limit else None}

    @router.get('/v1/followups/due', operation_id='hydV3GetDueList', response_model=DueList)
    def due(limit: int = Query(20, ge=1, le=50), mid=Depends(merchant)):
        with snapshot(settings.database_path) as connection:
            result = due_items(connection, mid, settings.now(), limit=limit)
            return {**result, 'coverage': 'RECORDED_LEDGER_AND_COMMITMENTS_ONLY', 'items': [
                {**item, 'commitment_id': item['id'], 'expected_amount_paise': item['promised_amount_paise'],
                 'status': item['due_status']} for item in result['items']
            ]}

    return router
