from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

Money = Annotated[int, Field(strict=True, ge=1, le=100_000_000)]
Version = Annotated[int, Field(strict=True, ge=1)]
Language = Literal['en-IN', 'hi-IN', 'te-IN']
EntryType = Literal['CREDIT_GIVEN', 'REPAYMENT_RECEIVED']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Proposed(StrictModel):
    entry_type: EntryType
    customer_id: str
    amount_paise: Money
    currency: Literal['INR'] = 'INR'


class CreateDraft(StrictModel):
    transcript: Annotated[str, Field(max_length=500)]
    language: Language
    customer_id: str | None = None
    parsed_override: Proposed | None = None


class EditDraft(StrictModel):
    expected_version: Version
    entry_type: EntryType
    customer_id: str
    amount_paise: Money


class ConfirmDraft(StrictModel):
    expected_version: Version
    confirm: StrictBool

    @field_validator('confirm')
    @classmethod
    def explicit(cls, value):
        if value is not True:
            raise ValueError('Explicit confirm=true required')
        return value


class Reverse(StrictModel):
    confirm: StrictBool
    reason: Annotated[str, Field(min_length=3, max_length=240)]
    _confirm = field_validator('confirm')(classmethod(lambda cls, v: ConfirmDraft.explicit(v)))


class Void(Reverse):
    reason: Annotated[str, Field(min_length=5, max_length=240)]


class CustomerCreate(StrictModel):
    display_name: Annotated[str, Field(min_length=1, max_length=120)]


class ObservationBase(StrictModel):
    observed_at: datetime
    source: Literal['MANUAL_OBSERVATION', 'FIXTURE']
    client_operation_id: Annotated[str, Field(min_length=8, max_length=128)]

    @field_validator('observed_at')
    @classmethod
    def aware(cls, v):
        if v.tzinfo is None:
            raise ValueError('Timezone is required')
        return v.astimezone(timezone.utc)


class Sale(ObservationBase):
    amount_paise: Money
    note: Annotated[str | None, Field(max_length=300)] = None


class Visit(ObservationBase):
    customer_id: str


class Speech(StrictModel):
    briefing_id: str


class SuggestionEdit(StrictModel):
    state: Literal['DISMISSED', 'DONE_MANUALLY']
