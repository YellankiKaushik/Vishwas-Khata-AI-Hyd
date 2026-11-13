from pathlib import Path
import sys
import os
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Keep temporary test databases inside the authorized workspace on Windows.
os.environ['TEMP'] = str(Path(__file__).resolve().parents[1] / '.tmp')
os.environ['TMP'] = os.environ['TEMP']


@pytest.fixture(autouse=True)
def offline_test_network(monkeypatch):
    from scripts.offline_guard import block_nonloopback
    block_nonloopback(monkeypatch)
