"""Local operator authorization receipts. No endpoint can create these files."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re

from .config import ROOT
from .domain import DomainError


def reserve_attempt(service, sample_id, approval_id, *, duration=0, characters=0, root=ROOT):
    """Reserve once BEFORE network I/O; timeout/failure never restores an attempt."""
    if service not in ('stt', 'tts') or any(not re.fullmatch(r'[A-Za-z0-9-]{1,60}', value) for value in (sample_id, approval_id)):
        raise DomainError('PROBE_PLAN_INVALID', 'Use the documented service and safe approval/sample IDs.')
    folder = Path(root) / 'private/voice-authorizations'
    try:
        approval = json.loads((folder / (approval_id + '.json')).read_text(encoding='utf-8'))
        now = datetime.now(timezone.utc)
        expires = datetime.fromisoformat(approval['expires_at'].replace('Z', '+00:00'))
        samples = approval['approved_sample_ids']
        valid = (approval['approval_id'] == approval_id and approval['service'] == service
                 and approval['operator_confirmed'] is True and approval['credits_checked'] is True
                 and approval['auto_recharge_status'] in ('DISABLED', 'CAPPED')
                 and expires.tzinfo is not None and expires > now
                 and isinstance(samples, list) and sample_id in samples
                 and len(samples) == len(set(samples))
                 and type(approval['max_calls']) is int and 0 < len(samples) <= approval['max_calls'] <= 12)
        if service == 'stt':
            valid = valid and 0 < duration <= approval['max_audio_seconds_per_call'] <= 20
        else:
            valid = valid and 0 < characters <= approval['max_text_characters_per_call'] <= 1500
        if not valid:
            raise ValueError('not approved or outside finite plan')
    except (OSError, ValueError, KeyError, TypeError):
        raise DomainError('PROBE_NOT_AUTHORIZED', 'No current operator-approved finite plan matches. Confirm credits, recharge status and separate STT/TTS approval; no provider request made.', 403)
    attempts = folder / approval_id
    attempts.mkdir(parents=True, exist_ok=True)
    receipt = attempts / (sample_id + '.attempt.json')
    try:
        with receipt.open('x', encoding='utf-8') as handle:
            json.dump({'service': service, 'sample_id': sample_id, 'approval_id': approval_id,
                       'reserved_at': now.isoformat(), 'duration_seconds': duration, 'characters': characters,
                       'status': 'ATTEMPT_RESERVED_NO_AUTOMATIC_RETRY'}, handle, indent=2)
    except FileExistsError:
        raise DomainError('PROBE_ATTEMPT_CONSUMED', 'This approved attempt was already reserved. Do not retry; another request needs new explicit authorization.', 409)
    return receipt


def record_result(receipt, result):
    target = receipt.with_name(receipt.name.replace('.attempt.json', '.result.json'))
    with target.open('x', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
    return target
