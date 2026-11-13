"""Bounded Sarvam vendor edge. It cannot post journal entries."""
from collections import OrderedDict
from contextlib import closing
from datetime import date
from io import BytesIO
from time import monotonic
from .limits import Quota
from typing import Literal
import base64
import json
import wave
import asyncio
import re
import hashlib
import hmac
import struct
from math import sqrt

import httpx
from fastapi import Depends, File, Form, UploadFile, Request
from fastapi.responses import Response

from .analytics import daily_facts
from .db import connect
from .domain import DomainError, uid
from .models import Speech

STT_MODEL = 'saaras:v4'
TTS_MODEL = 'bulbul:v4-flash'
BASE_URL = 'https://api.sarvam.ai'
MAX_AUDIO_BYTES = 10 * 1024 * 1024
PROVIDER_DEADLINE_SECONDS = 20


def validate_wav(raw: bytes, max_seconds=20):
    if len(raw) > MAX_AUDIO_BYTES:
        raise DomainError('AUDIO_TOO_LARGE', 'Use a recording smaller than 10 MB.', 413)
    try:
        with wave.open(BytesIO(raw), 'rb') as audio:
            duration = audio.getnframes() / audio.getframerate()
            if audio.getnchannels() not in (1, 2) or audio.getsampwidth() != 2 or not 8000 <= audio.getframerate() <= 48000 or not 0 < duration <= max_seconds:
                raise ValueError('unsupported audio metadata')
            expected = audio.getnframes() * audio.getnchannels() * audio.getsampwidth()
            if len(audio.readframes(audio.getnframes())) != expected:
                raise ValueError('truncated audio')
    except (wave.Error, EOFError, ValueError, ZeroDivisionError):
        raise DomainError('INVALID_AUDIO', f'Use a valid 16-bit PCM WAV recording of at most {max_seconds} seconds.')
    return duration


def validate_speech_input(raw: bytes):
    """Conservative pre-egress quality guard, not a speech/noise classifier."""
    duration = validate_wav(raw)
    if duration < 0.3:
        raise DomainError('AUDIO_TOO_SHORT', 'Record at least 0.3 seconds, preview your words, or type the sentence.')
    with wave.open(BytesIO(raw), 'rb') as audio:
        pcm = audio.readframes(audio.getnframes())
    count = len(pcm) // 2
    squares = total = 0
    for (sample,) in struct.iter_unpack('<h', pcm):
        squares += sample ** 2
        total += sample
    if not count or sqrt(max(0, squares / count - (total / count) ** 2)) < 32:
        raise DomainError('AUDIO_SILENT', 'Recording is silent or very quiet. Check the microphone and preview, or type the sentence.')
    return duration


class SarvamAdapter:
    def __init__(self, key, transport=None, clock=monotonic):
        self.key = key
        self.transport = transport
        self.clock = clock
        self.failures = 0
        self.open_until = 0

    def failed(self):
        self.failures += 1
        if self.failures >= 3:
            self.open_until = self.clock() + 30

    async def request(self, route, **kwargs):
        if self.clock() < self.open_until:
            raise DomainError('PROVIDER_CIRCUIT_OPEN', 'Speech is temporarily paused after provider failures. Wait 30 seconds or use typed entry.', 503)
        try:
            async with asyncio.timeout(PROVIDER_DEADLINE_SECONDS), httpx.AsyncClient(base_url=BASE_URL, timeout=20, transport=self.transport, follow_redirects=False) as client:
                async with client.stream('POST', route, headers={'api-subscription-key': self.key}, **kwargs) as response:
                    if response.status_code == 429:
                        self.failed()
                        raise DomainError('PROVIDER_RATE_LIMIT', 'Speech service is busy. Wait and retry, or type the entry.', 429)
                    if response.status_code in (401,403):
                        self.failed()
                        raise DomainError('PROVIDER_AUTHENTICATION_FAILED', 'Speech authentication was rejected. Check the backend key and account access; typed entry remains available.', 503)
                    if response.status_code != 200:
                        self.failed()
                        raise DomainError('PROVIDER_UNAVAILABLE', 'Speech provider rejected the request. Typed entry and text briefing remain available.', 503)
                    raw = bytearray()
                    async for chunk in response.aiter_bytes():
                        raw.extend(chunk)
                        if len(raw) > 15 * 1024 * 1024:
                            raise ValueError('response too large')
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise ValueError('object required')
            self.failures = 0
            return payload
        except (httpx.TimeoutException, TimeoutError):
            self.failed()
            raise DomainError('PROVIDER_TIMEOUT', 'Speech timed out. Retry or continue with typed entry.', 503)
        except (httpx.RequestError, ValueError):
            self.failed()
            raise DomainError('PROVIDER_UNAVAILABLE', 'Speech response unavailable. Typed entry remains available.', 503)

    async def transcribe(self, audio: bytes, language: str):
        payload = await self.request('/speech-to-text', files={'file': ('synthetic-recording.wav', audio, 'audio/wav')},
                                     data={'model': STT_MODEL, 'language_code': 'unknown' if language == 'auto' else language})
        text = payload.get('transcript')
        detected = payload.get('language_code')
        if detected is not None and (not isinstance(detected,str) or not re.fullmatch(r'[a-z]{2,3}-[A-Z]{2}|unknown',detected)):
            raise DomainError('INVALID_PROVIDER_RESPONSE', 'Detected language was invalid. Select the language and type the sentence.', 503)
        if not isinstance(text, str) or not text.strip() or len(text) > 500:
            raise DomainError('TRANSCRIPT_UNCERTAIN', 'Transcript empty or too long. Type or shorten the sentence.', 422)
        warnings = ['Untrusted transcription: correct every detail before drafting; no money posted.']
        if detected not in ('en-IN','hi-IN','te-IN'):
            warnings.append('Detected language is unknown or outside the evaluated demo locales; manual review is required.')
        if language != 'auto' and detected and detected != language:
            warnings.append('Requested and detected language differ; select the correct language and review the transcript.')
        return {'transcription_id': uid('transcription'), 'transcript': text.strip(), 'language_detected': detected or 'unknown',
                'source': 'LIVE_VENDOR', 'provider': 'sarvam', 'model': STT_MODEL,
                'warnings': warnings}

    async def speak(self, text: str, language: str):
        if len(text) > 2500:
            raise DomainError('BRIEFING_TOO_LONG', 'Briefing exceeds the provider character limit. Read the approved text instead.', 503)
        payload = await self.request('/text-to-speech', json={'text': text, 'language_code': language, 'model': TTS_MODEL,
                                                            'output_audio_codec': 'wav', 'speech_sample_rate': 22050})
        try:
            audios = payload['audios']
            if not isinstance(audios, list) or len(audios) != 1:
                raise ValueError('invalid audio array')
            audio = base64.b64decode(audios[0], validate=True)
            validate_wav(audio, max_seconds=600)
            return audio
        except (KeyError, ValueError, TypeError, DomainError):
            raise DomainError('INVALID_PROVIDER_AUDIO', 'Generated audio could not be validated. Read the visible briefing.', 503)


def install_voice(app, settings, merchant):
    app.state.voice_adapter = SarvamAdapter(settings.sarvam_api_key)
    quota = Quota('VOICE_QUOTA', 'Local speech limit reached. Wait a minute or use typed entry.')
    speech_cache = OrderedDict()
    speech_lock = asyncio.Lock()

    def available(tts=False, language=None):
        verified = settings.sarvam_tts_verified if tts else settings.sarvam_live_verified
        if settings.voice_provider != 'sarvam' or not settings.sarvam_api_key or not verified:
            raise DomainError('VOICE_UNAVAILABLE', 'Live Sarvam speech has not passed an authenticated probe. Use typed entry or read the briefing text.', 503)
        languages = settings.sarvam_tts_languages if tts else settings.sarvam_stt_languages
        if language not in languages:
            raise DomainError('VOICE_LOCALE_UNVERIFIED', 'This speech language has not been individually verified. Select a verified language or use typed entry.', 503)

    def capture_context(request, mid):
        return hashlib.sha256(('voice:' + request.cookies.get('vishwas_session', '') + ':' + mid).encode()).hexdigest()

    def check_context(request, mid, context):
        if context is not None and (not re.fullmatch(r'[0-9a-f]{64}', context) or not hmac.compare_digest(capture_context(request, mid), context)):
            raise DomainError('STALE_CAPTURE', 'The shop session changed. Discard this recording and record again; typed entry remains available.', 409)

    @app.get('/v1/voice/status')
    def voice_status(request: Request, mid=Depends(merchant)):
        configured=bool(settings.sarvam_api_key and settings.voice_provider=='sarvam')
        stt = bool(configured and settings.sarvam_live_verified and settings.sarvam_stt_languages)
        tts = bool(configured and settings.sarvam_tts_verified and settings.sarvam_tts_languages)
        return {'provider':settings.voice_provider,'status':'OFFLINE' if not configured else 'STT_ENABLED' if stt else 'CONFIGURED_UNVERIFIED',
                'stt_verified':stt,'tts_verified':tts,
                'stt_model':STT_MODEL,'tts_model':TTS_MODEL,'local_capture_available':True,'provider_contacted':False,
                'capture_context':capture_context(request,mid),
                'stt_verified_languages':list(settings.sarvam_stt_languages) if configured and settings.sarvam_live_verified else [],
                'tts_verified_languages':list(settings.sarvam_tts_languages) if configured and settings.sarvam_tts_verified else []}

    async def read_audio(audio):
        try:
            raw = await audio.read(MAX_AUDIO_BYTES + 1)
            if audio.content_type not in ('audio/wav', 'audio/x-wav', 'audio/wave'):
                raise DomainError('UNSUPPORTED_AUDIO', 'Use PCM WAV audio. The web recorder converts your recording before upload.')
            duration = validate_speech_input(raw)
            return raw, duration
        finally:
            await audio.close()

    @app.post('/v1/voice/validations')
    async def validate_recording(request: Request, audio: UploadFile = File(...), capture_context: str | None = Form(None), mid=Depends(merchant)):
        check_context(request,mid,capture_context)
        quota.take(mid, 'validation', 30)
        raw, duration = await read_audio(audio)
        with wave.open(BytesIO(raw), 'rb') as recording:
            return {'duration_seconds': duration, 'size_bytes': len(raw), 'sample_rate_hz': recording.getframerate(),
                    'channels': recording.getnchannels(), 'format': 'PCM_WAV', 'provider_called': False}

    @app.post('/v1/voice/transcriptions')
    async def transcribe(request: Request, audio: UploadFile = File(...), language_hint: Literal['hi-IN', 'te-IN', 'en-IN', 'auto'] = Form('auto'), capture_context: str | None = Form(None), mid=Depends(merchant)):
        check_context(request,mid,capture_context)
        raw, _ = await read_audio(audio)
        available(language=language_hint)
        quota.take(mid, 'stt', 5)
        result = await app.state.voice_adapter.transcribe(raw, language_hint)
        if merchant(request) != mid:
            raise DomainError('STALE_CAPTURE', 'Shop session changed during transcription. Discard the result.', 409)
        check_context(request,mid,capture_context)
        return result

    @app.post('/v1/briefings/speech')
    async def speak(body: Speech, request: Request, mid=Depends(merchant)):
        context = capture_context(request, mid)
        with closing(connect(settings.database_path)) as db:
            db.execute('BEGIN')
            row = db.execute('SELECT * FROM briefing_snapshots WHERE merchant_id=? AND id=?', (mid, body.briefing_id)).fetchone()
            if not row:
                raise DomainError('NOT_FOUND', 'Approved briefing unavailable in this shop.', 404)
            current = daily_facts(db, mid, date.fromisoformat(row['business_date']), settings.now())
            if current['facts_hash'] != row['facts_hash']:
                raise DomainError('STALE_BRIEFING', 'Supporting records changed. Refresh the text briefing before requesting audio.', 409)
            snapshot = json.loads(row['approved_slots_json'])
        available(tts=True, language=row['language'])
        text = '\n\n'.join(slot['text'] for slot in snapshot['slots'])
        cache_key = (mid, row['facts_hash'], row['language'], TTS_MODEL)
        async with speech_lock:
            cached = speech_cache.get(cache_key)
            cache_hit = bool(cached and monotonic()-cached[0] < 300)
            if cache_hit:
                audio = cached[1]
                speech_cache.move_to_end(cache_key)
            else:
                quota.take(mid, 'tts', 3)
                audio = await app.state.voice_adapter.speak(text, row['language'])
        # Discard an audio result if evidence was voided while the provider was working.
        with closing(connect(settings.database_path)) as db:
            fresh = daily_facts(db, mid, date.fromisoformat(row['business_date']), settings.now())
        if fresh['facts_hash'] != row['facts_hash']:
            raise DomainError('STALE_BRIEFING', 'Evidence changed while generating speech. Refresh the briefing.', 409)
        if merchant(request) != mid:
            raise DomainError('STALE_CAPTURE', 'Shop session changed during speech. Read the current briefing.', 409)
        check_context(request, mid, context)
        if not cache_hit:
            speech_cache[cache_key] = (monotonic(), audio)
            while len(speech_cache)>8 or sum(len(value[1]) for value in speech_cache.values())>16*1024*1024:
                speech_cache.popitem(last=False)
        return Response(content=audio, media_type='audio/wav', headers={'X-Voice-Cache':'HIT' if cache_hit else 'MISS','X-Voice-Model':TTS_MODEL})
