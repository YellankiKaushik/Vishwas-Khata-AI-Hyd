"""Optional operator-approved model adapter. The demo launcher disables this path."""
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
from time import monotonic

import httpx

from .config import ROOT
from .domain import DomainError

ENDPOINT = 'https://api.openai.com/v1/chat/completions'
MODEL = 'gpt-4.1-mini'
SAFE_APPROVAL_ID = re.compile(r'[A-Za-z0-9-]{1,60}')
SAFE_REQUEST_ID = re.compile(r'[A-Za-z0-9_-]{8,128}')


class LiveAssistant:
    def __init__(self, key, approval_id, *, root: Path = ROOT, transport=None):
        self.key = key
        self.approval_id = approval_id
        self.root = root / 'private/hyd-assistant-approvals'
        self.transport = transport

    def approval(self, merchant_id):
        if not self.key or not SAFE_APPROVAL_ID.fullmatch(self.approval_id):
            return ()
        try:
            plan = json.loads((self.root / (self.approval_id + '.json')).read_text(encoding='utf-8'))
            expires_at = datetime.fromisoformat(plan['expires_at'].replace('Z', '+00:00'))
            ids = plan['approved_request_ids']
            maximum = plan['max_calls']
            if (plan['approval_id'] == self.approval_id and plan['merchant_id'] == merchant_id
                    and plan['model'] == MODEL and plan['operator_confirmed'] is True
                    and plan['credits_checked'] is True and plan['auto_recharge_status'] in ('CAPPED', 'DISABLED')
                    and expires_at > datetime.now(timezone.utc) and type(maximum) is int
                    and isinstance(ids, list) and 0 < len(ids) <= maximum <= 5
                    and all(isinstance(i, str) and SAFE_REQUEST_ID.fullmatch(i) for i in ids)
                    and len(ids) == len(set(ids))):
                return tuple(ids)
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            pass
        return ()

    def attempt_path(self, request_id):
        return self.root / self.approval_id / (sha256(request_id.encode()).hexdigest() + '.attempt')

    def remaining(self, merchant_id):
        return sum(not self.attempt_path(request_id).exists() for request_id in self.approval(merchant_id))

    def decide(self, merchant_id, request_id, context, schema):
        if request_id not in self.approval(merchant_id):
            return None
        attempt = self.attempt_path(request_id)
        try:
            attempt.parent.mkdir(parents=True, exist_ok=True)
            # Atomic across threads and processes. A timeout or outage consumes the approved slot.
            with attempt.open('x', encoding='utf-8') as receipt:
                receipt.write(datetime.now(timezone.utc).isoformat())
        except FileExistsError:
            return None

        # Only server-generated intent/locale and temporary aliases cross the provider boundary.
        aliases = {f'e{i}': value for i, value in enumerate(context['evidence_ids'], 1)}
        provider_context = {'intent': context['intent'], 'language': context['language'], 'evidence_ids': list(aliases)}
        deadline = monotonic() + 12
        with httpx.Client(timeout=4, trust_env=False, transport=self.transport) as client:
            with client.stream(
                'POST', ENDPOINT, headers={'Authorization': 'Bearer ' + self.key},
                json={'model': MODEL, 'store': False, 'max_completion_tokens': 400,
                      'response_format': {'type': 'json_object'}, 'messages': [
                          {'role': 'system', 'content': 'Return only a JSON decision matching this schema. '
                           'Use only supplied evidence aliases. Never write a narrative. ' + json.dumps(schema)},
                          {'role': 'user', 'content': json.dumps(provider_context)},
                      ]},
            ) as response:
                response.raise_for_status()
                payload = bytearray()
                for chunk in response.iter_bytes():
                    if len(payload) + len(chunk) > 65536 or monotonic() > deadline:
                        raise TimeoutError('Model response exceeded its bound')
                    payload.extend(chunk)
        try:
            result = json.loads(payload)['choices'][0]['message']['content']
            if not isinstance(result, str) or len(result) > 8192:
                raise ValueError('Invalid model decision size')
            decision = json.loads(result)
            decision['proposed_evidence_ids'] = [aliases[item] for item in decision['proposed_evidence_ids']]
            return json.dumps(decision)
        except (KeyError, ValueError, TypeError, IndexError, RecursionError) as exc:
            raise DomainError('AI_UNAVAILABLE', 'The model did not return a supported decision.', 503) from exc
