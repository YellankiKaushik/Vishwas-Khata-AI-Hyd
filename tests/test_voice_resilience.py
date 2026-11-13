import asyncio
import base64
import httpx
import pytest

from apps.api.voice import SarvamAdapter
from apps.api.domain import DomainError
from test_finance_http import env
from test_voice_http import wav,enable,voice


@pytest.mark.parametrize('payload',[[],None,42,'not-object',{'transcript':{'injected':'object'}},{'transcript':'Valid text','language_code':123}])
def test_malformed_provider_shapes_are_safe_and_never_post(env,payload):
    s,a,c=env
    enable(s,a,lambda request:httpx.Response(200,json=payload) if payload is not None else httpx.Response(200,content=b'null'))
    r=voice(c)
    assert r.status_code in (422,503),r.text
    assert c.get('/v1/ledger/entries').json()['items']==[]


@pytest.mark.parametrize('status',[400,401,403,422,429,500,503])
def test_http_failures_redacted_without_automatic_billable_retry(env,status):
    s,a,c=env;calls=[]
    def handler(request):calls.append(request);return httpx.Response(status,text='private-key-or-upstream-detail')
    enable(s,a,handler);r=voice(c)
    assert r.status_code in (429,503)
    assert len(calls)==1 and 'private-key-or-upstream-detail' not in r.text


def test_circuit_opens_then_recovers_without_sleep():
    clock=[0.0];calls=[]
    def handler(request):calls.append(request);return httpx.Response(503 if len(calls)<=3 else 200,json={'transcript':'Ramesh took 500 credit','language_code':'en-IN'})
    adapter=SarvamAdapter('unit-key',httpx.MockTransport(handler),clock=lambda:clock[0])
    async def scenario():
        for _ in range(3):
            with pytest.raises(DomainError):await adapter.transcribe(wav(),'en-IN')
        with pytest.raises(DomainError,match='Speech is temporarily paused') as raised:await adapter.transcribe(wav(),'en-IN')
        assert raised.value.code=='PROVIDER_CIRCUIT_OPEN' and len(calls)==3
        clock[0]=31
        assert (await adapter.transcribe(wav(),'en-IN'))['transcript']=='Ramesh took 500 credit'
        assert len(calls)==4
    asyncio.run(scenario())


def test_tts_cache_is_source_bound_and_never_used_after_void(env):
    s,a,c=env;calls=[]
    def handler(request):calls.append(request);return httpx.Response(200,json={'audios':[base64.b64encode(wav()).decode()]})
    enable(s,a,handler)
    briefing=c.get('/v1/briefings/daily?date=2026-10-27').json()
    first=c.post('/v1/briefings/speech',json={'briefing_id':briefing['briefing_id']})
    second=c.post('/v1/briefings/speech',json={'briefing_id':briefing['briefing_id']})
    assert first.status_code==200 and first.headers['x-voice-cache']=='MISS'
    assert second.status_code==200 and second.headers['x-voice-cache']=='HIT'
    assert len(calls)==1
    c.post('/v1/observations/sales/sale_1027/void',json={'confirm':True,'reason':'Invalidate synthetic source'})
    assert c.post('/v1/briefings/speech',json={'briefing_id':briefing['briefing_id']}).status_code==409
    assert len(calls)==1


def test_unknown_detected_language_is_explicit(env):
    s,a,c=env;enable(s,a,lambda r:httpx.Response(200,json={'transcript':'Untrusted sentence','language_code':None}))
    response=voice(c).json()
    assert response['language_detected']=='unknown'
    assert any('unknown' in warning for warning in response['warnings'])


def test_stt_verification_does_not_enable_unverified_tts(env):
    s,a,c=env
    enable(s,a,lambda r: (_ for _ in ()).throw(AssertionError('TTS must not contact provider')))
    s.sarvam_tts_verified=False
    assert c.get('/v1/voice/status').json()['tts_verified'] is False
    bid=c.get('/v1/briefings/daily?date=2026-10-27').json()['briefing_id']
    assert c.post('/v1/briefings/speech',json={'briefing_id':bid}).status_code==503
