from test_finance_http import env
from test_voice_http import wav


def test_local_audio_validation_never_uses_provider_or_posts_money(env):
    settings,app,c=env
    class ForbiddenProvider:
        async def transcribe(self,*a):raise AssertionError('local validation cannot contact a provider')
    app.state.voice_adapter=ForbiddenProvider()
    r=c.post('/v1/voice/validations',files={'audio':('synthetic.wav',wav(2),'audio/wav')})
    assert r.status_code==200,r.text
    assert r.json()=={'duration_seconds':2.0,'size_bytes':64044,'sample_rate_hz':16000,'channels':1,'format':'PCM_WAV','provider_called':False}
    assert c.get('/v1/ledger/entries').json()['items']==[]
    assert c.post('/v1/voice/validations',files={'audio':('renamed.wav',b'not-a-wav','audio/wav')}).status_code==422
    c.cookies.clear()
    assert c.post('/v1/voice/validations',files={'audio':('synthetic.wav',wav(),'audio/wav')}).status_code==401
