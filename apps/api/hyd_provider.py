"""Optional operator-approved model adapter. The demo launcher disables this path."""
from datetime import datetime, timezone
from hashlib import sha256
import json
import logging
from pathlib import Path
import re
from time import monotonic

import httpx

from .config import ROOT
from .domain import DomainError

ENDPOINT = 'https://api.openai.com/v1/chat/completions'
MODEL = 'gpt-4.1-mini'
logger = logging.getLogger(__name__)
SAFE_MODEL = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}')
SAFE_APPROVAL_ID = re.compile(r'[A-Za-z0-9-]{1,60}')
SAFE_REQUEST_ID = re.compile(r'[A-Za-z0-9_-]{8,128}')


class LiveAssistant:
    def __init__(self, key, approval_id, *, root: Path = ROOT, transport=None, model=MODEL):
        if not isinstance(model, str) or not SAFE_MODEL.fullmatch(model):
            raise ValueError('Invalid assistant model identifier')
        self.model = model
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
                    and plan['model'] == self.model and plan['operator_confirmed'] is True
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

        telemetry = {'provider': 'openai', 'model': self.model, 'status': 'FAILED',
                     'input_tokens': None, 'output_tokens': None, 'actual_cost_usd': None}
        started = monotonic()
        try:
            decision = self._request(context, schema, telemetry)
            telemetry['status'] = 'RESPONSE_PARSED'
            return decision
        finally:
            telemetry['latency_ms'] = round((monotonic() - started) * 1000)
            # The one-time .attempt remains consumed even if receipt writing fails.
            # No prompts, keys, customer IDs, provider error bodies or raw response.
            try:
                with attempt.with_suffix('.result.json').open('x', encoding='utf-8') as receipt:
                    json.dump(telemetry, receipt, sort_keys=True)
            except OSError:
                pass
            logger.info('assistant_provider provider=openai model=%s status=%s latency_ms=%s input_tokens=%s output_tokens=%s',
                        self.model, telemetry['status'], telemetry['latency_ms'],
                        telemetry['input_tokens'], telemetry['output_tokens'])

    def _request(self, context, schema, telemetry):
        # Only server-generated intent/locale and temporary aliases cross the provider boundary.
        aliases = {f'e{i}': value for i, value in enumerate(context['evidence_ids'], 1)}
        provider_context = {'intent': context['intent'], 'language': context['language'], 'evidence_ids': list(aliases)}
        messages = [
            {'role': 'system', 'content': 'Return only a JSON decision matching this schema. '
             'Use only supplied evidence aliases. Never write a narrative. ' + json.dumps(schema)},
            {'role': 'user', 'content': json.dumps(provider_context)},
        ]
        if len(json.dumps(messages).encode('utf-8')) > 12000 or len(aliases) > 20:
            raise ValueError('Model input exceeded its bound')
        deadline = monotonic() + 12
        with httpx.Client(timeout=4, trust_env=False, transport=self.transport) as client:
            with client.stream(
                'POST', ENDPOINT, headers={'Authorization': 'Bearer ' + self.key},
                json={'model': self.model, 'store': False, 'max_completion_tokens': 400,
                      'response_format': {'type': 'json_object'}, 'messages': messages},
            ) as response:
                response.raise_for_status()
                payload = bytearray()
                for chunk in response.iter_bytes():
                    if len(payload) + len(chunk) > 65536 or monotonic() > deadline:
                        raise TimeoutError('Model response exceeded its bound')
                    payload.extend(chunk)
        try:
            document = json.loads(payload)
            if not isinstance(document, dict):
                raise ValueError('Invalid model response envelope')
            usage = document.get('usage', {})
            if isinstance(usage, dict):
                for field, key in (('input_tokens', 'prompt_tokens'), ('output_tokens', 'completion_tokens')):
                    count = usage.get(key)
                    if type(count) is int and 0 <= count <= 200000:
                        telemetry[field] = count
            result = document['choices'][0]['message']['content']
            if not isinstance(result, str) or len(result) > 8192:
                raise ValueError('Invalid model decision size')
            decision = json.loads(result)
            decision['proposed_evidence_ids'] = [aliases[item] for item in decision['proposed_evidence_ids']]
            return json.dumps(decision)
        except (KeyError, ValueError, TypeError, IndexError, RecursionError) as exc:
            raise DomainError('AI_UNAVAILABLE', 'The model did not return a supported decision.', 503) from exc
