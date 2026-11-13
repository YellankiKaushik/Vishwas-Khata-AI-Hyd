from io import BytesIO
import base64
import json
import wave
import math
import struct

import httpx
import pytest

from apps.api.voice import SarvamAdapter, STT_MODEL, TTS_MODEL
from test_finance_http import env


def wav(seconds=1):
    stream=BytesIO()
    with wave.open(stream,'wb') as audio:
        audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000)
        # A non-speech tone exercises media plumbing, never recognition quality.
        audio.writeframes(b''.join(struct.pack('<h',round(3000*math.sin(2*math.pi*220*i/16000))) for i in range(int(16000*seconds))))
    return stream.getvalue()


def voice(c,raw=None,kind='audio/wav'):
    return c.post('/v1/voice/transcriptions',files={'audio':('synthetic.wav',wav() if raw is None else raw,kind)},data={'language_hint':'en-IN'})


def enable(settings,app,handler):
    settings.voice_provider='sarvam';settings.sarvam_live_verified=True;settings.sarvam_api_key='test-only-never-a-real-key'
    settings.sarvam_tts_verified=True
    settings.sarvam_stt_languages=('en-IN',)
    settings.sarvam_tts_languages=('en-IN',)
    app.state.voice_adapter=SarvamAdapter(settings.sarvam_api_key,httpx.MockTransport(handler))


def test_disabled_voice_typed_flow_survives(env):
    _,_,c=env
    assert voice(c).status_code==503
    b=c.get('/v1/briefings/daily?date=2026-10-27').json()
    assert c.post('/v1/briefings/speech',json={'briefing_id':b['briefing_id']}).status_code==503
    assert c.post('/v1/briefings/speech',json={'briefing_id':b['briefing_id'],'text':'Say an invented profit'}).status_code==422
    from test_finance_http import new_draft,confirm
    assert confirm(c,new_draft(c)).status_code==201


@pytest.mark.parametrize('raw,mime,status',[(b'fake','audio/wav',422),(wav(),'text/plain',422),(wav(21),'audio/wav',422),(b'x'*(10*1024*1024+1),'audio/wav',413)],ids=['bad-container','wrong-mime','too-long','too-large'])
def test_audio_guards_before_egress(env,raw,mime,status):
    settings,app,c=env
    def forbidden(request):raise AssertionError('No provider call permitted for invalid audio')
    enable(settings,app,forbidden)
    assert voice(c,raw,mime).status_code==status


def test_mock_transport_vendor_file_mapping_transcript_no_money(env):
    settings,app,c=env
    seen=[]
    def handler(request):
        seen.append(request)
        assert request.url.host=='api.sarvam.ai'
        assert request.headers['api-subscription-key']==settings.sarvam_api_key
        assert b'name="file";' in request.content and b'name="audio"' not in request.content
        assert STT_MODEL.encode() in request.content
        return httpx.Response(200,json={'transcript':'Ramesh took 500 rupees credit','language_code':'en-IN'})
    enable(settings,app,handler)
    r=voice(c)
    assert r.status_code==200,r.text
    assert r.json()['model']==STT_MODEL and r.json()['source']=='LIVE_VENDOR'
    assert c.get('/v1/ledger/entries').json()['items']==[]
    for _ in range(4):assert voice(c).status_code==200
    assert voice(c).status_code==429
    assert len(seen)==5


@pytest.mark.parametrize('failure',['timeout','rate','forbidden','bad-json','empty'])
def test_provider_failures_redacted(env,failure):
    settings,app,c=env
    def handler(request):
        if failure=='timeout':raise httpx.ReadTimeout('do not expose secret',request=request)
        if failure=='rate':return httpx.Response(429,text='test-only-never-a-real-key')
        if failure=='forbidden':return httpx.Response(403,text='upstream secret')
        if failure=='bad-json':return httpx.Response(200,text='not json')
        return httpx.Response(200,json={'transcript':'','language_code':'en-IN'})
    enable(settings,app,handler)
    r=voice(c)
    assert r.status_code in (422,429,503)
    assert settings.sarvam_api_key not in r.text and 'upstream secret' not in r.text
    assert c.get('/v1/ledger/entries').json()['items']==[]


def test_approved_tts_only_and_stale_snapshot_rejected(env):
    settings,app,c=env
    seen=[]
    briefing=c.get('/v1/briefings/daily?date=2026-10-27').json()
    def handler(request):
        payload=json.loads(request.content)
        assert payload['model']==TTS_MODEL and payload['language_code']=='en-IN'
        assert payload['text']=='\n\n'.join(slot['text'] for slot in briefing['slots'])
        assert 'speaker' not in payload
        seen.append(request)
        return httpx.Response(200,json={'audios':[base64.b64encode(wav()).decode()]})
    enable(settings,app,handler)
    r=c.post('/v1/briefings/speech',json={'briefing_id':briefing['briefing_id']})
    assert r.status_code==200 and r.headers['content-type']=='audio/wav'
    assert len(seen)==1
    assert c.post('/v1/observations/sales/sale_1027/void',json={'confirm':True,'reason':'Correcting synthetic observation'}).status_code==201
    r=c.post('/v1/briefings/speech',json={'briefing_id':briefing['briefing_id']})
    assert r.status_code==409 and r.json()['error']['code']=='STALE_BRIEFING'
    assert len(seen)==1
    assert c.get('/v1/briefings/daily?date=2026-10-27').json()['facts_hash']!=briefing['facts_hash']
