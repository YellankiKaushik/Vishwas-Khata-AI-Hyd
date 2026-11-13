import os
from pathlib import Path
import subprocess
import sys

import pytest


@pytest.mark.parametrize('module', ['apps.api.probe', 'apps.api.probe_tts'])
def test_probe_help_works_in_windows_legacy_console_without_provider_access(module):
    env = dict(os.environ, PYTHONIOENCODING='cp1252', PYTHONUTF8='0')
    # Help exits before loading credentials, reading recordings or reserving paid attempts.
    result = subprocess.run([sys.executable, '-m', module, '--help'],
                            cwd=Path(__file__).resolve().parents[1],env=env,
                            capture_output=True,timeout=15)
    assert result.returncode == 0, result.stderr.decode('cp1252')
    assert b'--approval-id' in result.stdout and b'--sample-id' in result.stdout
    assert b'--allow-provider-call' in result.stdout
