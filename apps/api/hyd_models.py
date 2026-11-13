"""Published response types for the Hyderabad synthetic API."""
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

SourceIDs = Annotated[list[str], Field(max_length=20)]
DueStatus = Literal['DUE_TODAY', 'PAST_EXPECTED_DATE', 'REVIEW_REQUIRED']
State = Literal['ACTIVE', 'CANCELLED', 'HANDLED']


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class HyderabadError(BaseModel):
    error: ErrorDetail


def error_responses(*statuses):
    descriptions = {
        400: 'Invalid request length',
        401: 'Synthetic merchant session required',
        403: 'Origin or merchant not allowed',
        404: 'Resource unavailable in this merchant scope',
        409: 'Current state, facts or operation ID conflict',
        413: 'Request exceeds the local size limit',
        422: 'Invalid input or unsupported locale',
        429: 'Local request limit reached',
        503: 'Database temporarily unavailable',
    }
    return {status: {'model': HyderabadError, 'description': descriptions[status]} for status in statuses}


class BusinessScope(BaseModel):
    as_of_date_ist: date
    as_of_utc: datetime


class CommitmentFacts(BusinessScope):
    id: str
    customer_id: str
    customer_display_name: str
    state: State
    version: int
    expected_date: date
    promised_amount_paise: int | None
    outstanding_paise: int
    last_reviewed_ledger_hash: str
    ledger_hash: str
    ledger_source_count: int
    ledger_first_posted_at: datetime | None
    ledger_last_posted_at: datetime | None
    evidence_hash: str
    event_id: str
    evidence_ids: SourceIDs
    review_required: bool
    due_status: DueStatus | Literal['UPCOMING', 'CUSTOMER_ARCHIVED', 'SETTLED_BALANCE', 'CANCELLED', 'HANDLED']
    followup_eligible: bool
    coverage: Literal['RECORDED_ONLY']


class CommitmentResponse(CommitmentFacts):
    status: Literal['RECORDED_EXPECTATION_NOT_PAYMENT']


class CommitmentList(BusinessScope):
    coverage: Literal['RECORDED_ONLY']
    items: list[CommitmentResponse]
    next_cursor: str | None


class CommitmentEvent(BaseModel):
    id: str
    commitment_id: str
    event_type: Literal['CREATED', 'UPDATED', 'CANCELLED', 'HANDLED']
    previous_version: int | None
    new_version: int
    previous_snapshot: dict | None
    new_snapshot: dict
    reason: str
    created_at: datetime
    actor_id: str


class CommitmentEvents(BaseModel):
    items: list[CommitmentEvent]
    next_after_version: int | None


class DueItem(CommitmentFacts):
    commitment_id: str
    expected_amount_paise: int | None
    status: DueStatus


class DueList(BusinessScope):
    coverage: Literal['RECORDED_LEDGER_AND_COMMITMENTS_ONLY']
    facts_hash: str
    total: int
    items: list[DueItem]


class AssistantResponse(BusinessScope):
    status: Literal['ANSWER', 'CLARIFICATION', 'INSUFFICIENT_DATA']
    intent: Literal['DUE_COMMITMENTS', 'CUSTOMER_BALANCE', 'RECORDED_ACTIVITY', 'DRAFT_FOLLOWUP', 'UNKNOWN']
    provider_mode: Literal['DISABLED', 'MOCK', 'AUTHORIZED_LIVE']
    answer_mode: Literal['DETERMINISTIC', 'DETERMINISTIC_FALLBACK', 'MOCK', 'AUTHORIZED_LIVE']
    language: Literal['en-IN']
    live_verified: Literal[False]
    facts_hash: str
    items: list[dict]
    rendered_text: Annotated[str, Field(max_length=700)]
    evidence_ids: SourceIDs
    evidence_id_count: int
    coverage: Literal['RECORDED_ONLY', 'INSUFFICIENT_DATA']


class FollowupDraft(BusinessScope):
    status: Literal['DRAFT_NOT_SENT']
    sent: Literal[False]
    review_required: Literal[True]
    language: Literal['en-IN']
    customer_id: str
    outstanding_paise: int
    expected_date: date
    text: Annotated[str, Field(max_length=700)]
    source_facts_hash: str
    evidence_ids: SourceIDs
    coverage: Literal['RECORDED_ONLY']


class AssistantStatus(BaseModel):
    status: Literal['AVAILABLE']
    enabled: Literal[True]
    provider_mode: Literal['DISABLED', 'MOCK', 'AUTHORIZED_LIVE']
    reason_if_disabled: str | None
    remaining_approved_calls: int
    live_verified: Literal[False]
    verified_locales: list[Literal['en-IN']]
    can_send: Literal[False]
