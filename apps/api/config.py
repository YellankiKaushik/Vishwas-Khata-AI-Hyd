"""Local synthetic-only configuration. Real data is deliberately unsupported."""
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
import os
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
SPEC = ROOT / 'Project_Vishwas_Khata_V3'


@dataclass
class Settings:
    database_path: Path = ROOT / 'data/vishwas.sqlite3'
    demo_mode: bool = True
    voice_provider: str = 'mock'
    sarvam_api_key: str = field(default='', repr=False)
    sarvam_live_verified: bool = False
    sarvam_tts_verified: bool = False
    sarvam_stt_languages: tuple[str, ...] = ()
    sarvam_tts_languages: tuple[str, ...] = ()
    as_of: str | None = None
    hyd_enabled: bool = True
    hyd_live_approval: str = ''
    hyd_assistant_provider: str = 'deterministic'
    hyd_assistant_model: str = 'gpt-4.1-mini'
    hyd_assistant_key: str = field(default='', repr=False)

    @classmethod
    def environment(cls):
        load_dotenv(ROOT / '.env', override=False)
        return cls(
            database_path=Path(os.getenv('DATABASE_PATH', str(ROOT / 'data/vishwas.sqlite3'))).resolve(),
            demo_mode=os.getenv('DEMO_MODE', 'true').lower() == 'true',
            voice_provider=os.getenv('VOICE_PROVIDER', 'mock'),
            sarvam_api_key=os.getenv('SARVAM_API_KEY', ''),
            sarvam_live_verified=os.getenv('SARVAM_LIVE_VERIFIED', 'false').lower() == 'true',
            sarvam_tts_verified=os.getenv('SARVAM_TTS_VERIFIED', 'false').lower() == 'true',
            sarvam_stt_languages=tuple(x.strip() for x in os.getenv('SARVAM_STT_LANGUAGES', '').split(',') if x.strip() in ('en-IN', 'hi-IN', 'te-IN')),
            sarvam_tts_languages=tuple(x.strip() for x in os.getenv('SARVAM_TTS_LANGUAGES', '').split(',') if x.strip() in ('en-IN', 'hi-IN', 'te-IN')),
            as_of=os.getenv('VISHWAS_AS_OF') or None,
            hyd_enabled=os.getenv('HYDERABAD_ENABLED', 'true').lower() == 'true',
            hyd_assistant_provider=os.getenv('HYDERABAD_ASSISTANT_PROVIDER', 'deterministic'),
            hyd_assistant_model=os.getenv('HYDERABAD_ASSISTANT_MODEL', 'gpt-4.1-mini'),
            hyd_live_approval=os.getenv('HYDERABAD_LIVE_ASSISTANT_APPROVAL', '')
            if (os.getenv('HYDERABAD_LIVE_ASSISTANT_ENABLED', 'false').lower() == 'true'
                and os.getenv('HYDERABAD_ASSISTANT_PROVIDER', 'deterministic') == 'openai') else '',
            hyd_assistant_key=os.getenv('HYDERABAD_ASSISTANT_API_KEY', ''),
        )

    def now(self):
        if self.as_of:
            stamp = datetime.fromisoformat(self.as_of.replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                raise ValueError('VISHWAS_AS_OF must include timezone')
            return stamp.astimezone(timezone.utc)
        return datetime.now(timezone.utc)


def utc_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')
