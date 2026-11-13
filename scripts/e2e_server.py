"""Isolated synthetic server owned and stopped by Playwright; never resets the demo DB."""
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from apps.api.config import Settings
from apps.api.manage import seed
from apps.api.main import create_app
import uvicorn

if __name__ == '__main__':
    from offline_guard import block_nonloopback
    block_nonloopback()
    settings = Settings.environment()
    settings.voice_provider = 'mock'
    settings.sarvam_api_key = ''
    settings.sarvam_live_verified = settings.sarvam_tts_verified = False
    settings.sarvam_stt_languages = settings.sarvam_tts_languages = ()
    settings.hyd_enabled = True
    settings.hyd_live_approval = settings.hyd_assistant_key = ''
    if not settings.database_path.is_relative_to(ROOT / '.tmp'):
        raise SystemExit('Browser test database must be isolated under .tmp/')
    seed(settings)
    uvicorn.run(create_app(settings), host='127.0.0.1', port=8001, access_log=False)
