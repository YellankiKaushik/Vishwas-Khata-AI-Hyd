"""Transport-only staging checks. These tests never contact a provider."""
from datetime import datetime, timedelta, timezone
import json
import logging

import httpx
import pytest

from apps.api.config import Settings
from apps.api.hyd_provider import LiveAssistant, MODEL


def approved(tmp_path, transport, *, model=MODEL):
    adapter = LiveAssistant('synthetic-secret-for-redaction-test', 'staging-test',
                            root=tmp_path, transport=httpx.MockTransport(transport), model=model)
    adapter.root.mkdir(parents=True)
    (adapter.root / 'staging-test.json').write_text(json.dumps({
        'approval_id': 'staging-test', 'merchant_id': 'synthetic-tenant', 'model': model,
        'operator_confirmed': True, 'credits_checked': True, 'auto_recharge_status': 'DISABLED',
        'expires_at': (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
        'approved_request_ids': ['staging-request-01'], 'max_calls': 1,
    }), encoding='utf-8')
    return adapter


CONTEXT = {'intent': 'CUSTOMER_BALANCE', 'language': 'en-IN', 'evidence_ids': ['ledger:private-synthetic-id']}


def test_explicit_provider_and_live_switch_are_both_required(monkeypatch):
    monkeypatch.setenv('HYDERABAD_LIVE_ASSISTANT_ENABLED', 'true')
    monkeypatch.setenv('HYDERABAD_LIVE_ASSISTANT_APPROVAL', 'staging-test')
    for provider in ('deterministic', 'unknown-provider'):
        monkeypatch.setenv('HYDERABAD_ASSISTANT_PROVIDER', provider)
        assert Settings.environment().hyd_live_approval == ''
    monkeypatch.setenv('HYDERABAD_ASSISTANT_PROVIDER', 'openai')
    assert Settings.environment().hyd_live_approval == 'staging-test'
    monkeypatch.setenv('HYDERABAD_LIVE_ASSISTANT_ENABLED', 'false')
    assert Settings.environment().hyd_live_approval == ''


def test_model_approval_aliasing_and_redacted_usage_receipt(tmp_path, caplog):
    calls = []
    def transport(request):
        calls.append(request)
        body = json.loads(request.content)
        assert body['model'] == 'gpt-4.1-mini-2025-04-14'
        assert body['store'] is False and body['max_completion_tokens'] == 400
        assert 'private-synthetic-id' not in request.content.decode()
        return httpx.Response(200, json={
            'choices': [{'message': {'content': json.dumps({'proposed_evidence_ids': ['e1']})}}],
            'usage': {'prompt_tokens': 42, 'completion_tokens': 17},
        })
    adapter = approved(tmp_path, transport, model='gpt-4.1-mini-2025-04-14')
    caplog.set_level(logging.INFO, logger='apps.api.hyd_provider')
    assert adapter.remaining('other-tenant') == 0
    assert json.loads(adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {})) == {
        'proposed_evidence_ids': CONTEXT['evidence_ids'],
    }
    receipt = json.loads(adapter.attempt_path('staging-request-01').with_suffix('.result.json').read_text())
    assert receipt['input_tokens'] == 42 and receipt['output_tokens'] == 17
    assert receipt['actual_cost_usd'] is None and receipt['latency_ms'] >= 0
    assert receipt['status'] == 'RESPONSE_PARSED'
    combined = json.dumps(receipt) + caplog.text
    assert adapter.key not in combined and 'private-synthetic-id' not in combined
    assert adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {}) is None
    assert len(calls) == 1


def test_timeout_consumes_finite_slot_without_retry_and_records_no_error_body(tmp_path):
    calls = []
    def timeout(request):
        calls.append(request)
        raise httpx.ReadTimeout('sensitive provider error body', request=request)
    adapter = approved(tmp_path, timeout)
    with pytest.raises(httpx.ReadTimeout):
        adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {})
    result = adapter.attempt_path('staging-request-01').with_suffix('.result.json').read_text()
    assert json.loads(result)['status'] == 'FAILED'
    assert 'sensitive' not in result
    assert adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {}) is None
    assert len(calls) == 1 and adapter.remaining('synthetic-tenant') == 0


def test_changed_model_requires_new_matching_approval(tmp_path):
    adapter = approved(tmp_path, lambda _: pytest.fail('No transport authorized'))
    adapter.model = 'different-model'
    assert adapter.remaining('synthetic-tenant') == 0
    assert adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {}) is None


def test_inference_input_bound_fails_before_transport(tmp_path):
    adapter = approved(tmp_path, lambda _: pytest.fail('Oversized prompt must not leave process'))
    with pytest.raises(ValueError, match='input exceeded'):
        adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {'description': 'x' * 12001})
    assert adapter.remaining('synthetic-tenant') == 0


def test_provider_keys_are_not_in_settings_repr():
    settings = Settings(sarvam_api_key='private-speech-key', hyd_assistant_key='private-model-key')
    assert 'private-speech-key' not in repr(settings)
    assert 'private-model-key' not in repr(settings)


@pytest.mark.parametrize('response', [[], None, {'choices': []}, {'choices': [{'message': {'content': '[]'}}]}])
def test_malformed_provider_envelopes_fail_closed(tmp_path, response):
    from apps.api.domain import DomainError
    adapter = approved(tmp_path, lambda _: httpx.Response(200, json=response))
    with pytest.raises(DomainError, match='supported decision'):
        adapter.decide('synthetic-tenant', 'staging-request-01', CONTEXT, {})
    assert adapter.remaining('synthetic-tenant') == 0
