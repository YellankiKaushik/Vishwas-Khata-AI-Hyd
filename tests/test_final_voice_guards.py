from contextlib import closing
from io import BytesIO
import wave

import httpx
import pytest

from apps.api.db import connect
from test_finance_http import env
from test_voice_http import wav, enable, voice


def quiet_wav(seconds=1, amplitude=0):
    stream = BytesIO()
    with wave.open(stream, 'wb') as audio:
        audio.setnchannels(1); audio.setsampwidth(2); audio.setframerate(16000)
        audio.writeframes(amplitude.to_bytes(2, 'little', signed=True) * int(16000 * seconds))
    return stream.getvalue()


@pytest.mark.parametrize('raw,code', [(wav(.1), 'AUDIO_TOO_SHORT'), (quiet_wav(), 'AUDIO_SILENT'), (quiet_wav(amplitude=5), 'AUDIO_SILENT'), (quiet_wav(amplitude=1000), 'AUDIO_SILENT')])
def test_silence_and_short_input_stop_before_provider(env, raw, code):
    s, a, c = env
    enable(s, a, lambda r: (_ for _ in ()).throw(AssertionError('Invalid input must not reach a provider')))
    result = voice(c, raw)
    assert result.status_code == 422 and result.json()['error']['code'] == code
    checked = c.post('/v1/voice/validations', files={'audio': ('input.wav', raw, 'audio/wav')})
    assert checked.status_code == 422
    assert c.get('/v1/ledger/entries').json()['items'] == []


@pytest.mark.parametrize('language', ['hi-IN', 'te-IN', 'auto'])
def test_one_english_verification_cannot_enable_other_languages(env, language):
    s, a, c = env
    enable(s, a, lambda r: (_ for _ in ()).throw(AssertionError('Unevaluated locale must not reach provider')))
    result = c.post('/v1/voice/transcriptions', files={'audio': ('input.wav', wav(), 'audio/wav')}, data={'language_hint': language})
    assert result.status_code == 503 and result.json()['error']['code'] == 'VOICE_LOCALE_UNVERIFIED'
    assert c.get('/v1/voice/status').json()['stt_verified_languages'] == ['en-IN']


def test_unverified_tts_language_is_rejected_even_with_global_flag(env):
    s, a, c = env
    enable(s, a, lambda r: (_ for _ in ()).throw(AssertionError('Unverified TTS locale')))
    s.sarvam_tts_languages = ()
    bid = c.get('/v1/briefings/daily?date=2026-10-27').json()['briefing_id']
    result = c.post('/v1/briefings/speech', json={'briefing_id': bid})
    assert result.status_code == 503 and result.json()['error']['code'] == 'VOICE_LOCALE_UNVERIFIED'


def test_old_capture_context_cannot_cross_a_session_refresh(env):
    s, a, c = env
    enable(s, a, lambda r: (_ for _ in ()).throw(AssertionError('Stale capture must not egress')))
    old = c.get('/v1/voice/status').json()['capture_context']
    c.post('/v1/demo/session')
    current = c.get('/v1/voice/status').json()['capture_context']
    assert old != current
    for context in (old, 'అ', 'invalid'):
        for route in ('validations', 'transcriptions'):
            result = c.post('/v1/voice/' + route, files={'audio': ('input.wav', wav(), 'audio/wav')}, data={'language_hint': 'en-IN', 'capture_context': context})
            assert result.status_code == 409 and result.json()['error']['code'] == 'STALE_CAPTURE'
    assert c.get('/v1/ledger/entries').json()['items'] == []


def test_expired_session_discards_late_provider_result(env):
    s, a, c = env
    def response(request):
        with closing(connect(s.database_path)) as db:
            db.execute('DELETE FROM demo_sessions')
        return httpx.Response(200, json={'transcript': 'Ramesh took 500 credit', 'language_code': 'en-IN'})
    enable(s, a, response)
    result = voice(c)
    assert result.status_code == 401
    with closing(connect(s.database_path)) as db:
        assert db.execute('SELECT COUNT(*) FROM ledger_entries').fetchone()[0] == 0
