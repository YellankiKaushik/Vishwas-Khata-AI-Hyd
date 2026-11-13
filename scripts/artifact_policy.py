"""Explicit phase boundary for legacy finale generators; no authorization by flag."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def require_final_asset_phase():
    policy = ROOT / 'docs/completion/ARTIFACT_FREEZE.json'
    if '--release-assets' not in sys.argv or not policy.is_file() or json.loads(policy.read_text(encoding='utf-8')).get('final_assets_allowed') is not True:
        raise SystemExit('DEFERRED UNTIL APPLICATION FREEZE: final asset generation requires application acceptance and a later explicit user request.')
