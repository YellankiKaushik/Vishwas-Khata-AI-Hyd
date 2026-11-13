"""Grounded answers and unsent drafts. Provider output can only select an approved template."""
from datetime import date
import logging
import re
from typing import Annotated, Literal, Protocol

from fastapi import APIRouter, Depends
from httpx import HTTPError
from pydantic import Field, StrictBool, ValidationError, field_validator

from .analytics import daily_facts, rupees
from .commitments import Digest, Identifier
from .domain import DomainError, customer, fingerprint
from .hyd_evidence import (
    MAX_SOURCE_IDS, commitment_view, due_items, evidence_hash, ledger_view, owned_commitment, scope, snapshot,
)
from .hyd_models import AssistantResponse, AssistantStatus, FollowupDraft, error_responses
from .limits import Quota
from .models import ConfirmDraft, Language, StrictModel, Version

Intent = Literal['DUE_COMMITMENTS', 'CUSTOMER_BALANCE', 'RECORDED_ACTIVITY', 'DRAFT_FOLLOWUP']
logger = logging.getLogger(__name__)
TEMPLATES = {
    'DUE_COMMITMENTS': {'DUE_LIST', 'DUE_EXPLANATION'},
    'CUSTOMER_BALANCE': {'BALANCE_SUMMARY'},
    'RECORDED_ACTIVITY': {'ACTIVITY_SUMMARY'},
    'DRAFT_FOLLOWUP': {'POLITE_REMINDER'},
}
RESTRICTED_REQUEST = re.compile(
    r'\b(?:ignore|override|bypass|system prompt|api key|select .* from|delete|drop table|'
    r'legal|loan|approve|payment link|settlement|settled|profit|predict|send|whatsapp|'
    r'threaten|harass|shame|bank|paytm|reverse|tenant|script)\b', re.I,
)
UNSUPPORTED_FACTS = re.compile(
    r'\b(?:never return|bank payment|legally delinquent|revenue|income|profit|'
    r'hourly sales peak|loan default risk|credit scor(?:e|es|ing)|what[- ]if|forecast|'
    r'yesterday|(?:last|this|next) (?:week|month|quarter|year))\b'
    r'|^when will .+ repay\b', re.I,
)
INTENT_RULES = (
    ('DRAFT_FOLLOWUP', re.compile(r'\b(?:draft|compose|write|prepare)\b.*\b(?:reminder|message|follow[- ]?up)\b', re.I)),
    ('DUE_COMMITMENTS', re.compile(r'\b(?:due|overdue|follow[- ]?ups?|expected (?:repayment )?dates?|commitments?)\b', re.I)),
    ('CUSTOMER_BALANCE', re.compile(r'\b(?:balances?|outstanding|owes?|receivables?)\b', re.I)),
    ('RECORDED_ACTIVITY', re.compile(r'\b(?:what was recorded today|activity|sales|credit|repayments?)\b', re.I)),
)
NAMED_QUESTIONS = (
    ('DUE_COMMITMENTS', re.compile(r'why is (.{1,120}?) (?:due|on the due list)', re.I)),
    ('CUSTOMER_BALANCE', re.compile(r'how much does (.{1,120}) owe', re.I)),
    ('CUSTOMER_BALANCE', re.compile(r'what is (.{1,120}?)(?:\'s)? outstanding(?: now)?', re.I)),
    ('CUSTOMER_BALANCE', re.compile(r'show evidence ids for (.{1,120}?)(?:\'s)? balance', re.I)),
    ('RECORDED_ACTIVITY', re.compile(r'summarize current credit and repayment for (.{1,120})', re.I)),
)
POSITIVE_BALANCES = re.compile(r'which customers have (?:current )?positive balances', re.I)
EXPECTED_DATE_MEANING = re.compile(r'(?:can you )?explain what the expected date means', re.I)


class Question(StrictModel):
    question: Annotated[str, Field(min_length=1, max_length=500)]
    language: Language
    customer_id: Identifier | None = None
    request_id: Annotated[str, Field(min_length=8, max_length=128)]


class DraftRequest(StrictModel):
    commitment_id: Identifier
    expected_version: Version
    language: Language
    tone: Literal['POLITE'] = 'POLITE'
    facts_hash: Digest
    confirm_review: StrictBool

    @field_validator('confirm_review')
    @classmethod
    def explicit_review(cls, value):
        return ConfirmDraft.explicit(value)


class AssistantDecision(StrictModel):
    decision: Literal['ANSWER', 'CLARIFY', 'INSUFFICIENT_DATA']
    intent: Intent | Literal['UNKNOWN']
    template_id: Literal['BALANCE_SUMMARY', 'DUE_LIST', 'DUE_EXPLANATION', 'POLITE_REMINDER',
                         'ACTIVITY_SUMMARY', 'ASK_CUSTOMER', 'NO_EVIDENCE']
    language: Language
    proposed_evidence_ids: Annotated[list[Annotated[str, Field(min_length=1, max_length=100)]],
                                    Field(max_length=20, json_schema_extra={'uniqueItems': True})]


class AssistantProvider(Protocol):
    def __call__(self, question: str, context: dict, schema: dict) -> str: ...


def classify(question):
    if RESTRICTED_REQUEST.search(question):
        return None
    return next((intent for intent, pattern in INTENT_RULES if pattern.search(question)), None)


def require_supported_locale(language):
    if language != 'en-IN':
        raise DomainError('UNSUPPORTED_LOCALE', 'The Hyderabad assistant and draft templates support en-IN.')


def collect(connection, merchant_id, intent, customer_id, now, due_filter=None, *,
            positive_balances=False, customer_history=False):
    context = scope(now)
    if customer_id is not None:
        selected = customer(connection, merchant_id, customer_id)
    items, evidence_ids, text = [], [], ''
    insufficient = 'No matching records are available.'
    if intent in ('DUE_COMMITMENTS', 'DRAFT_FOLLOWUP'):
        if intent == 'DRAFT_FOLLOWUP' and customer_id is None:
            insufficient = 'Select a customer before asking about a follow-up draft.'
        else:
            due = due_items(connection, merchant_id, now, customer_id)
            items = due['items']
            if due_filter:
                items = [item for item in items if item['due_status'] == due_filter]
            eligible = sum(item['followup_eligible'] for item in items)
            review = sum(item['review_required'] for item in items)
            evidence_ids = [source for item in items for source in item['evidence_ids']]
            if items:
                if intent == 'DRAFT_FOLLOWUP':
                    text = ('Review the current balance and expected date before preparing an unsent draft.'
                            if eligible else 'Review the newer ledger entries before using the expected date.')
                else:
                    if customer_id is not None:
                        item = items[0]
                        state = {
                            'DUE_TODAY': 'The merchant-entered expected date is today.',
                            'PAST_EXPECTED_DATE': 'The merchant-entered expected date has passed.',
                            'REVIEW_REQUIRED': 'New positive ledger entries require review of the recorded expectation.',
                        }[item['due_status']]
                        text = (f"Recorded balance: {rupees(item['outstanding_paise'])}. "
                                f"Expected date: {item['expected_date']}. {state}")
                    else:
                        text = f'{eligible} recorded expectations are due. {review} accounts require a new ledger review.'
                    if not due_filter and due['total'] > len(items):
                        text += ' Select a customer to narrow the results.'
            insufficient = 'No eligible expected dates or accounts requiring review were found.'
    elif intent == 'CUSTOMER_BALANCE':
        if customer_id is None and positive_balances:
            customers = connection.execute(
                'SELECT id,display_name FROM customers WHERE merchant_id=? AND archived_at IS NULL ORDER BY id LIMIT 50',
                (merchant_id,),
            )
            for row in customers:
                ledger = ledger_view(connection, merchant_id, row['id'])
                if ledger['outstanding_paise'] > 0:
                    items.append({'customer_id': row['id'], 'customer_display_name': row['display_name'], **ledger})
                    evidence_ids.extend(ledger['evidence_ids'])
            if items:
                text = f'{len(items)} customers have a positive recorded balance.'
        elif customer_id is None:
            insufficient = 'Select the customer whose recorded balance you want to check.'
        else:
            ledger = ledger_view(connection, merchant_id, customer_id)
            evidence_ids = ledger['evidence_ids']
            if evidence_ids:
                items = [{'customer_id': customer_id, 'customer_display_name': selected['display_name'], **ledger}]
                text = f"Current recorded balance: {rupees(ledger['outstanding_paise'])}."
    elif intent == 'RECORDED_ACTIVITY' and customer_id is None:
        day = date.fromisoformat(context['as_of_date_ist'])
        facts = daily_facts(connection, merchant_id, day, now)
        names = ('observed_sales_paise', 'credit_given_paise', 'repayments_received_paise')
        metrics = [fact for fact in facts['facts'] if fact['metric'] in names]
        evidence_ids = list(dict.fromkeys(
            [f'ledger:{entry}' for fact in metrics for entry in fact['source_entry_ids']]
            + [f'sale:{event}' for fact in metrics for event in fact['source_event_ids']]
        ))
        if evidence_ids:
            items = [{name: facts[name] for name in (*names, 'observation_coverage', 'facts_hash')}]
            item = items[0]
            observed = item['observed_sales_paise']
            sales = 'No sales observations for this date.' if observed is None else f'Recorded sales observations: {rupees(observed)}.'
            text = (f"{sales} Recorded credit: {rupees(item['credit_given_paise'])}. "
                    f"Recorded repayments: {rupees(item['repayments_received_paise'])}.")
    elif intent == 'RECORDED_ACTIVITY' and customer_history:
        ledger = ledger_view(connection, merchant_id, customer_id)
        evidence_ids = ledger['evidence_ids']
        if evidence_ids:
            credit, repayments = connection.execute(
                """SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT_GIVEN' THEN amount_paise_signed END),0),
                          COALESCE(SUM(CASE WHEN entry_type='REPAYMENT_RECEIVED' THEN -amount_paise_signed END),0)
                   FROM ledger_entries WHERE merchant_id=? AND customer_id=?""",
                (merchant_id, customer_id),
            ).fetchone()
            items = [{'customer_id': customer_id, 'customer_display_name': selected['display_name'],
                      'credit_given_paise': credit, 'repayments_received_paise': repayments, **ledger}]
            text = (f'Recorded credit postings: {rupees(credit)}. Recorded repayment postings: {rupees(repayments)}. '
                    f'Current balance including corrections: {rupees(ledger["outstanding_paise"])}.')
    elif intent == 'RECORDED_ACTIVITY':
        insufficient = 'Clear the customer selection to view shop-wide recorded activity.'

    stable_items = [{key: value for key, value in item.items() if key != 'as_of_utc'} for item in items]
    return {
        **context, 'intent': intent, 'items': items, 'evidence_ids': evidence_ids[:MAX_SOURCE_IDS],
        'evidence_id_count': len(evidence_ids),
        'facts_hash': evidence_hash(merchant_id, context['as_of_date_ist'], [intent, customer_id, stable_items, evidence_ids]),
        'status': 'ANSWER' if text else 'INSUFFICIENT_DATA', 'rendered_text': text or insufficient,
        'coverage': context['coverage'] if text else 'INSUFFICIENT_DATA',
    }


def valid_decision(raw, bundle):
    if not isinstance(raw, (str, bytes)) or len(raw) > 8192:
        return False
    try:
        proposal = AssistantDecision.model_validate_json(raw, strict=True)
    except ValidationError:
        return False
    return (
        proposal.decision == 'ANSWER'
        and proposal.intent == bundle['intent']
        and proposal.template_id in TEMPLATES[bundle['intent']]
        and proposal.language == 'en-IN'
        and bool(proposal.proposed_evidence_ids)
        and len(set(proposal.proposed_evidence_ids)) == len(proposal.proposed_evidence_ids)
        and set(proposal.proposed_evidence_ids) <= set(bundle['evidence_ids'])
    )


def ask(settings, merchant_id, body, mock_provider: AssistantProvider | None, live_provider=None):
    require_supported_locale(body.language)
    question = body.question.rstrip('?. ')
    named = None
    unsupported = UNSUPPORTED_FACTS.search(question)
    definition = EXPECTED_DATE_MEANING.fullmatch(question)
    intent = None if unsupported or definition else classify(question)
    if intent:
        for named_intent, rule in NAMED_QUESTIONS:
            named = rule.fullmatch(question)
            if named:
                intent = named_intent
                break
    due_filter = None
    if intent == 'DUE_COMMITMENTS' and named is None:
        if re.search(r'\bdue today\b', question, re.I):
            due_filter = 'DUE_TODAY'
        elif re.search(r'\bbefore today\b', question, re.I):
            due_filter = 'PAST_EXPECTED_DATE'

    def load():
        with snapshot(settings.database_path) as connection:
            customer_id = body.customer_id
            selected = customer(connection, merchant_id, customer_id) if customer_id is not None else None
            if intent and named:
                normalized = named[1].strip().casefold()
                if selected is not None:
                    matches = selected['normalized_name'] == normalized
                else:
                    rows = connection.execute(
                        '''SELECT id FROM customers WHERE merchant_id=? AND normalized_name=?
                           AND archived_at IS NULL ORDER BY id LIMIT 2''',
                        (merchant_id, normalized),
                    ).fetchall()
                    matches = len(rows) == 1
                    if matches:
                        customer_id = rows[0]['id']
                if not matches:
                    result = collect(connection, merchant_id, None, None, settings.now())
                    result.update(status='CLARIFICATION', intent=intent,
                                  rendered_text='Select the exact customer by name and ID.')
                    return result
            return collect(connection, merchant_id, intent, customer_id, settings.now(), due_filter,
                           positive_balances=bool(POSITIVE_BALANCES.fullmatch(question)),
                           customer_history=named is not None and intent == 'RECORDED_ACTIVITY')

    bundle = load()
    if unsupported:
        bundle.update(rendered_text='The recorded evidence cannot establish that information.')
    elif definition:
        bundle.update(status='ANSWER', intent='DUE_COMMITMENTS',
                      rendered_text='An expected date is a merchant-recorded repayment expectation. '
                                    'It does not post money or prove payment. The signed journal determines the balance.')
    elif intent is None:
        bundle.update(status='CLARIFICATION', rendered_text='Ask about expected dates, a selected balance, or recorded activity.')
    mode = 'DETERMINISTIC'
    if (mock_provider is not None or live_provider is not None) and bundle['status'] == 'ANSWER' and bundle['evidence_ids']:
        context = {'intent': intent, 'evidence_ids': bundle['evidence_ids'], 'language': body.language}
        schema = AssistantDecision.model_json_schema()
        try:
            if mock_provider is not None:
                decision = mock_provider(body.question, context, schema)
                proposed_mode = 'MOCK'
            else:
                decision = live_provider.decide(merchant_id, body.request_id, context, schema)
                proposed_mode = 'AUTHORIZED_LIVE'
            mode = proposed_mode if valid_decision(decision, bundle) else 'DETERMINISTIC_FALLBACK'
        except (TimeoutError, OSError, ValueError, DomainError, HTTPError):
            mode = 'DETERMINISTIC_FALLBACK'
        latest = load()
        if latest['facts_hash'] != bundle['facts_hash']:
            mode = 'DETERMINISTIC_FALLBACK'
        bundle = latest
    return {**bundle, 'intent': bundle['intent'] or 'UNKNOWN', 'language': body.language,
            'provider_mode': mode if mode in ('MOCK', 'AUTHORIZED_LIVE') else 'DISABLED',
            'answer_mode': mode, 'live_verified': False}


def make_draft(settings, merchant_id, body):
    require_supported_locale(body.language)
    with snapshot(settings.database_path) as connection:
        item = commitment_view(connection, owned_commitment(connection, merchant_id, body.commitment_id), settings.now())
    if item['version'] != body.expected_version:
        raise DomainError('VERSION_CONFLICT', 'The expected date changed. Refresh and review again.', 409)
    if item['evidence_hash'] != body.facts_hash:
        raise DomainError('STALE_EVIDENCE', 'The recorded facts changed. Refresh and review again.', 409)
    if not item['followup_eligible']:
        raise DomainError('REVIEW_REQUIRED', 'A current, due expectation and positive balance are required.', 409)
    text = (f"Hello, could you please review the current recorded balance of {rupees(item['outstanding_paise'])}? "
            f"Our records show an expected date of {item['expected_date']}. "
            'If you have already made a payment, please let me know so I can check the record. Thank you.')
    return {
        'status': 'DRAFT_NOT_SENT', 'sent': False, 'review_required': True, 'language': body.language, 'text': text,
        'customer_id': item['customer_id'], 'outstanding_paise': item['outstanding_paise'],
        'expected_date': item['expected_date'], 'source_facts_hash': item['evidence_hash'],
        **{key: item[key] for key in ('as_of_utc', 'as_of_date_ist', 'coverage', 'evidence_ids')},
    }


def assistant_router(settings, merchant, mock_provider=None, live_provider=None):
    router = APIRouter(tags=['Hyderabad assistant'], responses=error_responses(400, 401, 403, 413, 422, 503))
    quota = Quota('QUOTA_EXCEEDED', 'Assistant request limit reached. Wait a minute and retry.')

    @router.get('/v1/assistant/status', operation_id='hydV3AssistantStatus', response_model=AssistantStatus)
    def status(mid=Depends(merchant)):
        remaining = live_provider.remaining(mid) if live_provider is not None and mock_provider is None else 0
        mode = 'MOCK' if mock_provider else 'AUTHORIZED_LIVE' if remaining else 'DISABLED'
        return {'status': 'AVAILABLE', 'enabled': True, 'provider_mode': mode,
                'reason_if_disabled': 'Deterministic answers are available without model inference.' if mode == 'DISABLED' else None,
                'remaining_approved_calls': remaining, 'live_verified': False,
                'verified_locales': ['en-IN'], 'can_send': False}

    @router.post('/v1/assistant/questions', operation_id='hydV3AskAssistant', response_model=AssistantResponse,
                 responses=error_responses(404, 429))
    def questions(body: Question, mid=Depends(merchant)):
        quota.take(mid, 'question', 30)
        result = ask(settings, mid, body, mock_provider, live_provider)
        logger.info('assistant_result status=%s mode=%s facts_sha256=%s response_sha256=%s evidence_count=%s',
                    result['status'], result['answer_mode'], result['facts_hash'],
                    fingerprint(result), result['evidence_id_count'])
        return result

    @router.post('/v1/followups/drafts', operation_id='hydV3DraftFollowup', response_model=FollowupDraft,
                 responses=error_responses(404, 409))
    def drafts(body: DraftRequest, mid=Depends(merchant)):
        return make_draft(settings, mid, body)

    return router
