from contextlib import asynccontextmanager, closing
from datetime import timedelta
from pathlib import Path
from typing import Annotated
import hashlib
import json
import re
import secrets
import sqlite3
from copy import deepcopy
import yaml

from fastapi import FastAPI, Depends, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from .config import Settings, utc_text, SPEC
from .db import connect, transaction, migrate, migration_files
from .domain import DomainError, uid, fingerprint, customer, balance, draft, draft_json, entry_json, post_result, audit, extract
from .models import CreateDraft, EditDraft, ConfirmDraft, Reverse, CustomerCreate

ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174', 'http://127.0.0.1:8000', 'http://localhost:8000', 'http://127.0.0.1:8001', 'http://localhost:8001']
Key = Annotated[str, Header(alias='Idempotency-Key', min_length=8, max_length=128)]
WEB_BUILD = Path(__file__).resolve().parents[1] / 'web/dist'
INVALID_STATIC_CHAR = re.compile(r'[\x00-\x1f<>:"\\|?*]')


class MerchantStaticFiles(StaticFiles):
    def get_path(self, scope: Scope) -> str:
        # Validate the decoded URL before Windows normalizes or looks up the path.
        path = scope['path']
        if INVALID_STATIC_CHAR.search(path) or any(
            part.endswith(('.', ' ')) for part in path.split('/')
        ):
            raise HTTPException(status_code=404)
        return super().get_path(scope)


def create_app(settings: Settings | None = None, *, assistant_mock_provider=None, assistant_live_provider=None):
    settings = settings or Settings.environment()

    @asynccontextmanager
    async def lifespan(app):
        if not settings.demo_mode:
            raise RuntimeError('Real-data mode is not implemented. DEMO_MODE must be true; bind only to loopback.')
        migrate(settings.database_path)
        with closing(connect(settings.database_path)) as db:
            if db.execute('SELECT 1 FROM merchants WHERE simulated!=1').fetchone():
                raise RuntimeError('Non-synthetic merchants are prohibited')
        yield

    app = FastAPI(title='Vishwas Khata · local synthetic demo', version='0.1.0', lifespan=lifespan)
    app.state.settings = settings
    app.state.fault_injector = lambda step: None
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', '[::1]'])
    app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=True,
                       allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Content-Type', 'Idempotency-Key','Client-Operation-Id'])

    def error(request, code, message, status):
        return JSONResponse({'error': {'code': code, 'message': message, 'request_id': request.state.request_id}}, status_code=status)

    @app.middleware('http')
    async def safety(request: Request, call_next):
        request.state.request_id = uid('req')
        if request.client and request.client.host not in ('127.0.0.1', '::1', 'localhost', 'testclient'):
            return error(request, 'LOCAL_ONLY', 'This synthetic demo accepts loopback connections only.', 403)
        if request.method in ('POST', 'PATCH') and request.headers.get('origin') not in (None, *ORIGINS):
            return error(request, 'ORIGIN_REJECTED', 'Open the local merchant application to make changes.', 403)
        try:
            length=int(request.headers.get('content-length','0'))
            if length<0:raise ValueError('negative length')
        except ValueError:
            return error(request,'INVALID_CONTENT_LENGTH','Invalid request length.',400)
        hyd_json = request.url.path.startswith(('/v1/commitments', '/v1/followups/', '/v1/assistant/'))
        limit = 8192 if hyd_json else 10_600_000
        if length > limit:
            return error(request, 'REQUEST_TOO_LARGE', 'Upload exceeds the demo limit.', 413)
        if request.method in ('POST', 'PATCH'):
            # Bound actual streamed bytes as well as Content-Length, including
            # chunked uploads, before multipart/JSON parsing or provider access.
            chunks, received = [], 0
            async for chunk in request.stream():
                received += len(chunk)
                if received > limit:
                    return error(request, 'REQUEST_TOO_LARGE', 'Upload exceeds the demo limit.', 413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        response = await call_next(request)
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy']='no-referrer'
        response.headers['Permissions-Policy']='microphone=(self), camera=(), geolocation=()'
        response.headers['X-Frame-Options']='DENY'
        if request.url.path not in ('/docs','/redoc','/docs/oauth2-redirect'):
            response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
        return response

    @app.exception_handler(DomainError)
    async def domain_error(request, exc):
        return error(request, exc.code, exc.message, exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error(request, 'VALIDATION_ERROR', 'Check the required fields, exact amount, timezone and explicit confirmation.', 422)

    @app.exception_handler(sqlite3.IntegrityError)
    async def integrity_error(request, exc):
        return error(request, 'INTEGRITY_CONFLICT', 'This change violates a ledger or source-data rule. Refresh and review the record.', 409)

    @app.exception_handler(sqlite3.OperationalError)
    async def database_error(request, exc):
        return error(request, 'DATABASE_UNAVAILABLE', 'Database busy or unavailable. Retry the original operation key.', 503)

    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        return error(request, 'INTERNAL_ERROR', 'The operation could not be completed. Retry with the same operation key.', 500)

    def merchant(request: Request):
        token = request.cookies.get('vishwas_session', '')
        with closing(connect(settings.database_path)) as db:
            row = db.execute('''SELECT m.* FROM demo_sessions s JOIN merchants m ON m.id=s.merchant_id
                WHERE s.token_hash=? AND s.expires_at>?''', (hashlib.sha256(token.encode()).hexdigest(), utc_text(settings.now()))).fetchone()
        if not row:
            raise DomainError('UNAUTHENTICATED', 'Start a local synthetic demo session.', 401)
        if not settings.demo_mode or row['simulated'] != 1:
            raise DomainError('REAL_DATA_DISABLED', 'Only synthetic demo shops are permitted.', 403)
        return row['id']

    app.state.merchant_dependency = merchant

    @app.get('/v1/health/live')
    def live():
        return {'status': 'alive', 'version': '0.1.0'}

    @app.get('/v1/health/ready')
    def ready():
        expected = [path.name for path in migration_files()]
        with closing(connect(settings.database_path)) as db:
            names = [row['name'] for row in db.execute('SELECT name FROM schema_migrations ORDER BY name')]
            if not expected or names != sorted(expected) or db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise DomainError('NOT_READY', 'Schema or database is not ready.', 503)
        return {'status': 'ready', 'schema_revision': expected[-1].split('_', 1)[0], 'hyd_enabled': settings.hyd_enabled,
                'voice_provider': settings.voice_provider,
                'voice_live_verified': bool(settings.sarvam_live_verified and settings.sarvam_stt_languages and settings.sarvam_api_key and settings.voice_provider=='sarvam'),
                'stt_verified_languages': list(settings.sarvam_stt_languages) if settings.sarvam_live_verified and settings.sarvam_api_key and settings.voice_provider=='sarvam' else [],
                'tts_verified_languages': list(settings.sarvam_tts_languages) if settings.sarvam_tts_verified and settings.sarvam_api_key and settings.voice_provider=='sarvam' else [],
                'tts_live_verified': bool(settings.sarvam_tts_verified and settings.sarvam_tts_languages and settings.sarvam_api_key and settings.voice_provider=='sarvam'), 'synthetic_clock': settings.as_of}

    @app.post('/v1/demo/session')
    def demo_session(response: Response):
        if not settings.demo_mode:
            raise DomainError('LOCAL_ONLY', 'Demo session disabled.', 403)
        token = secrets.token_urlsafe(32)
        with transaction(settings.database_path) as db:
            row = db.execute("SELECT id FROM merchants WHERE id='merch_demo_001' AND simulated=1").fetchone()
            if not row:
                raise DomainError('SEED_REQUIRED', 'Run the synthetic seed command first.', 503)
            db.execute('INSERT INTO demo_sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), row[0], utc_text(settings.now() + timedelta(hours=12))))
        response.set_cookie('vishwas_session', token, httponly=True, samesite='strict', max_age=43200, path='/')
        return {'mode': 'LOCAL_SYNTHETIC_ONLY', 'merchant_id': row[0]}

    @app.get('/v1/merchants/me')
    def me(mid=Depends(merchant)):
        with closing(connect(settings.database_path)) as db:
            row = dict(db.execute('SELECT id,display_name,timezone,simulated FROM merchants WHERE id=?', (mid,)).fetchone())
            row['simulated'] = bool(row['simulated'])
            return row

    def customer_json(row):
        return {'id': row['id'], 'display_name': row['display_name'], 'archived': row['archived_at'] is not None, 'simulated': True}

    @app.get('/v1/customers')
    def customers(query: str = Query('', max_length=120), limit: int = Query(20, ge=1, le=50), mid=Depends(merchant)):
        with closing(connect(settings.database_path)) as db:
            return [customer_json(c) for c in db.execute('SELECT * FROM customers WHERE merchant_id=? AND instr(normalized_name,?)>0 ORDER BY normalized_name,id LIMIT ?', (mid, query.casefold(), limit))]

    @app.post('/v1/customers', status_code=201)
    def create_customer(body: CustomerCreate, request: Request, mid=Depends(merchant)):
        cid, now = uid('cus'), utc_text(settings.now())
        with transaction(settings.database_path) as db:
            if db.execute('SELECT COUNT(*) FROM customers WHERE merchant_id=?', (mid,)).fetchone()[0] >= 50:
                raise DomainError('DEMO_CUSTOMER_LIMIT', 'This local demo supports up to 50 synthetic customer labels.')
            db.execute('INSERT INTO customers VALUES (?,?,?,?,?,NULL)', (cid, mid, body.display_name, body.display_name.casefold(), now))
            audit(db, mid, 'CUSTOMER_CREATE', 'customer', cid, request.state.request_id, now)
            return customer_json(customer(db, mid, cid))

    @app.get('/v1/customers/{customer_id}/balance')
    def customer_balance(customer_id: str, include_review_token: bool = False, mid=Depends(merchant)):
        if settings.hyd_enabled and include_review_token:
            from .hyd_evidence import ledger_view, snapshot
            with snapshot(settings.database_path) as db:
                customer(db, mid, customer_id)
                view = ledger_view(db, mid, customer_id)
                return {'customer_id': customer_id, 'outstanding_balance_paise': view['outstanding_paise'],
                        'currency': 'INR', 'ledger_hash': view['ledger_hash']}
        with closing(connect(settings.database_path)) as db:
            customer(db, mid, customer_id)
            return {'customer_id': customer_id, 'outstanding_balance_paise': balance(db, mid, customer_id), 'currency': 'INR'}

    @app.post('/v1/ledger/drafts', status_code=201)
    def create_draft(body: CreateDraft, request: Request, response: Response,
                     client_operation_id: str | None = Header(None,alias='Client-Operation-Id',min_length=8,max_length=128), mid=Depends(merchant)):
        now, did = settings.now(), uid('draft')
        digest=fingerprint(body.model_dump(mode='json'))
        with transaction(settings.database_path) as db:
            if client_operation_id:
                old=db.execute('SELECT * FROM draft_creation_intents WHERE merchant_id=? AND operation_id=?',(mid,client_operation_id)).fetchone()
                if old:
                    if old['request_hash']!=digest:
                        raise DomainError('DRAFT_INTENT_CONFLICT','This creation intent already has different draft details.',409)
                    response.status_code=200
                    return draft_json(draft(db,mid,old['draft_id']))
            cid, kind, amount, state = extract(db, mid, body)
            db.execute('''INSERT INTO ledger_drafts(id,merchant_id,customer_id,raw_utterance,language,entry_type,amount_paise,state,
                created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
                       (did, mid, cid, body.transcript, body.language, kind, amount, state, utc_text(now), utc_text(now), utc_text(now + timedelta(minutes=30))))
            audit(db, mid, 'DRAFT_CREATE', 'draft', did, request.state.request_id, utc_text(now))
            if client_operation_id:
                db.execute('INSERT INTO draft_creation_intents VALUES (?,?,?,?,?)',(mid,client_operation_id,digest,did,utc_text(now)))
            return draft_json(draft(db, mid, did))

    # Additive read route permits reload recovery without generating another draft.
    @app.get('/v1/ledger/drafts/{draft_id}')
    def get_draft(draft_id: str, mid=Depends(merchant)):
        with closing(connect(settings.database_path)) as db:
            row=draft(db,mid,draft_id)
            result = draft_json(row)
            if row['state'] in ('AWAITING_CONFIRMATION','NEEDS_REVIEW') and row['expires_at']<=utc_text(settings.now()):
                result.update(state='EXPIRED',needs_review=False,warnings=['Draft expired. Create and review a new draft.'])
            row = db.execute('SELECT * FROM ledger_entries WHERE merchant_id=? AND draft_id=?', (mid, draft_id)).fetchone()
            if row:
                result['posted_result'] = post_result(db, row)
            return result

    def active(row, version=None):
        if row['state'] not in ('NEEDS_REVIEW', 'AWAITING_CONFIRMATION'):
            raise DomainError('DRAFT_TERMINAL', 'This draft is already finalized or rejected.', 409)
        if row['expires_at'] <= utc_text(settings.now()):
            raise DomainError('DRAFT_EXPIRED', 'This draft expired. Create and review a new draft.', 409)
        if version is not None and row['version'] != version:
            raise DomainError('VERSION_CONFLICT', 'Draft changed. Refresh and review its current version.', 409)

    @app.patch('/v1/ledger/drafts/{draft_id}')
    def edit_draft(draft_id: str, body: EditDraft, request: Request, mid=Depends(merchant)):
        with transaction(settings.database_path) as db:
            row = draft(db, mid, draft_id)
            active(row, body.expected_version)
            customer(db, mid, body.customer_id)
            db.execute('''UPDATE ledger_drafts SET customer_id=?,entry_type=?,amount_paise=?,state='AWAITING_CONFIRMATION',
                version=version+1,updated_at=? WHERE merchant_id=? AND id=? AND version=?''',
                       (body.customer_id, body.entry_type, body.amount_paise, utc_text(settings.now()), mid, draft_id, body.expected_version))
            audit(db, mid, 'DRAFT_EDIT', 'draft', draft_id, request.state.request_id, utc_text(settings.now()))
            return draft_json(draft(db, mid, draft_id))

    @app.post('/v1/ledger/drafts/{draft_id}/cancel')
    def cancel_draft(draft_id: str, request: Request, mid=Depends(merchant)):
        with transaction(settings.database_path) as db:
            row = draft(db, mid, draft_id)
            active(row)
            db.execute("UPDATE ledger_drafts SET state='CANCELLED',updated_at=? WHERE merchant_id=? AND id=?", (utc_text(settings.now()), mid, draft_id))
            audit(db, mid, 'DRAFT_CANCEL', 'draft', draft_id, request.state.request_id, utc_text(settings.now()))
        return {'draft_id': draft_id, 'state': 'CANCELLED'}

    def replay(db, mid, key, digest):
        existing = db.execute('SELECT * FROM idempotency_records WHERE merchant_id=? AND key=?', (mid, key)).fetchone()
        if existing:
            if existing['request_hash'] != digest:
                raise DomainError('IDEMPOTENCY_CONFLICT', 'This retry key belongs to different confirmed details.', 409)
            return db.execute('SELECT * FROM ledger_entries WHERE merchant_id=? AND id=?', (mid, existing['entry_id'])).fetchone()

    @app.post('/v1/ledger/drafts/{draft_id}/confirm', status_code=201)
    def confirm(draft_id: str, body: ConfirmDraft, request: Request, response: Response, idempotency_key: Key, mid=Depends(merchant)):
        digest = fingerprint({'route': 'confirm', 'merchant': mid, 'draft': draft_id, **body.model_dump()})
        with transaction(settings.database_path) as db:
            existing = replay(db, mid, idempotency_key, digest)
            if existing:
                response.status_code = 200
                return post_result(db, existing)
            row = draft(db, mid, draft_id)
            if row['state'] == 'CONFIRMED':
                raise DomainError('ALREADY_CONFIRMED', 'This draft has already been posted. Refresh the journal.', 409)
            active(row, body.expected_version)
            if row['state'] != 'AWAITING_CONFIRMATION':
                raise DomainError('NEEDS_REVIEW', 'Complete the customer, amount and type review first.', 409)
            customer(db, mid, row['customer_id'])
            amount = row['amount_paise'] * (1 if row['entry_type'] == 'CREDIT_GIVEN' else -1)
            if balance(db, mid, row['customer_id']) + amount < 0:
                raise DomainError('OVERPAYMENT', 'Repayment exceeds this customer’s outstanding balance.')
            eid, now = uid('entry'), utc_text(settings.now())
            db.execute('''INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,
                posted_at,source,actor_id,simulated) VALUES (?,?,?,?,?,?,?,?,?,1)''',
                       (eid, mid, row['customer_id'], draft_id, row['entry_type'], amount, now, row['source'], 'local-demo-merchant'))
            app.state.fault_injector('after_entry')
            changed = db.execute("UPDATE ledger_drafts SET state='CONFIRMED',updated_at=? WHERE merchant_id=? AND id=? AND version=? AND state='AWAITING_CONFIRMATION'", (now, mid, draft_id, body.expected_version)).rowcount
            if changed != 1:
                raise DomainError('VERSION_CONFLICT', 'Draft changed; review before confirming.', 409)
            app.state.fault_injector('after_draft')
            db.execute('INSERT INTO idempotency_records VALUES (?,?,?,?,?)', (mid, idempotency_key, digest, eid, now))
            app.state.fault_injector('after_idempotency')
            audit(db, mid, 'LEDGER_POST', 'entry', eid, request.state.request_id, now, {'draft_id': draft_id})
            app.state.fault_injector('after_audit')
            result = post_result(db, db.execute('SELECT * FROM ledger_entries WHERE merchant_id=? AND id=?', (mid, eid)).fetchone())
            db.execute('INSERT INTO confirmation_receipts VALUES (?,?,?)', (mid, eid, json.dumps(result)))
            app.state.fault_injector('after_receipt')
        return result

    @app.get('/v1/ledger/entries')
    def entries(limit: int = Query(50, ge=1, le=100), cursor: str | None = None, mid=Depends(merchant)):
        with closing(connect(settings.database_path)) as db:
            params: list = [mid]
            where = ''
            if cursor:
                prior = db.execute('SELECT posted_at,id FROM ledger_entries WHERE merchant_id=? AND id=?', (mid, cursor)).fetchone()
                if not prior:
                    raise DomainError('INVALID_CURSOR', 'Journal cursor is unavailable.')
                where = ' AND (posted_at,id) < (?,?)'
                params.extend(prior)
            rows = db.execute('SELECT * FROM ledger_entries WHERE merchant_id=?' + where + ' ORDER BY posted_at DESC,id DESC LIMIT ?', (*params, limit + 1)).fetchall()
            return {'items': [entry_json(e) for e in rows[:limit]], 'next_cursor': rows[limit-1]['id'] if len(rows) > limit else None}

    @app.post('/v1/ledger/entries/{entry_id}/reverse', status_code=201)
    def reverse(entry_id: str, body: Reverse, request: Request, response: Response, idempotency_key: Key, mid=Depends(merchant)):
        digest = fingerprint({'route': 'reverse', 'merchant': mid, 'entry': entry_id, **body.model_dump()})
        with transaction(settings.database_path) as db:
            existing = replay(db, mid, idempotency_key, digest)
            if existing:
                response.status_code = 200
                return entry_json(existing)
            row = db.execute('SELECT * FROM ledger_entries WHERE merchant_id=? AND id=?', (mid, entry_id)).fetchone()
            if not row:
                raise DomainError('NOT_FOUND', 'Entry unavailable in this shop.', 404)
            if row['entry_type'] == 'REVERSAL' or db.execute('SELECT 1 FROM ledger_entries WHERE merchant_id=? AND reverses_entry_id=?', (mid, entry_id)).fetchone():
                raise DomainError('ALREADY_REVERSED', 'Entry cannot be reversed again.', 409)
            amount = -row['amount_paise_signed']
            if balance(db, mid, row['customer_id']) + amount < 0:
                raise DomainError('NEGATIVE_BALANCE', 'Reverse the related repayment first; this correction would make receivables negative.', 409)
            eid, now = uid('entry'), utc_text(settings.now())
            db.execute('''INSERT INTO ledger_entries(id,merchant_id,customer_id,entry_type,amount_paise_signed,reverses_entry_id,
                posted_at,source,actor_id,reason,simulated) VALUES (?,?,?,'REVERSAL',?,?,?,?,?,?,1)''',
                       (eid, mid, row['customer_id'], amount, entry_id, now, 'MANUAL', 'local-demo-merchant', body.reason))
            db.execute('INSERT INTO idempotency_records VALUES (?,?,?,?,?)', (mid, idempotency_key, digest, eid, now))
            audit(db, mid, 'LEDGER_REVERSE', 'entry', eid, request.state.request_id, now, {'reason': body.reason, 'original': entry_id})
            return entry_json(db.execute('SELECT * FROM ledger_entries WHERE merchant_id=? AND id=?', (mid, eid)).fetchone())

    from .analytics import install_analytics
    from .voice import install_voice
    install_analytics(app, settings, merchant)
    install_voice(app, settings, merchant)
    if settings.hyd_enabled:
        from .assistant import assistant_router
        from .commitments import commitment_router
        if (assistant_live_provider is None and settings.hyd_assistant_provider == 'openai'
                and settings.hyd_live_approval and settings.hyd_assistant_key):
            from .hyd_provider import LiveAssistant
            assistant_live_provider = LiveAssistant(settings.hyd_assistant_key, settings.hyd_live_approval, model=settings.hyd_assistant_model)
        app.include_router(commitment_router(settings, merchant))
        app.include_router(assistant_router(settings, merchant, assistant_mock_provider, assistant_live_provider))
    generated_openapi = app.openapi

    def implemented_openapi():
        if app.openapi_schema is not None:
            return app.openapi_schema
        extra = generated_openapi()
        contract = deepcopy(yaml.safe_load((SPEC / 'contracts/openapi.yaml').read_text(encoding='utf-8')))
        contract['info'] = {'title': 'Vishwas Khata AI Hyderabad - local synthetic API', 'version': '0.4.0-local',
                            'description': 'Local synthetic ledger and Hyderabad follow-up workspace. Deterministic assistant and unsent drafts.'}
        for path, methods in extra['paths'].items():
            for method, operation in methods.items():
                contract['paths'].setdefault(path, {}).setdefault(method, operation)
        for kind, values in extra.get('components', {}).items():
            for name, value in values.items():
                contract['components'].setdefault(kind, {}).setdefault(name, value)
        contract['paths']['/v1/demo/session']['post']['security'] = []
        # A reversal retry is a successful stable replay, as for normal confirmation.
        reverse_responses = contract['paths']['/v1/ledger/entries/{entry_id}/reverse']['post']['responses']
        reverse_responses['200'] = {**reverse_responses['201'], 'description': 'Stable idempotent reversal replay'}
        create_contract=contract['paths']['/v1/ledger/drafts']['post']
        create_contract['parameters']=[{'name':'Client-Operation-Id','in':'header','required':False,'schema':{'type':'string','minLength':8,'maxLength':128}}]
        create_contract['responses']['200']={**create_contract['responses']['201'],'description':'Same creation intent and canonical payload; original draft'}
        app.openapi_schema = contract
        return contract

    app.openapi = implemented_openapi
    if WEB_BUILD.is_dir():
        app.mount('/', MerchantStaticFiles(directory=WEB_BUILD, html=True), name='merchant-web')
    return app


app = create_app()
