"""Read-only app/source/secret/deferred-artifact verification. No provider or media generation."""
import hashlib
import json
from pathlib import Path
import subprocess

from dotenv import dotenv_values
from package_venue import assert_no_secret

ROOT = Path(__file__).resolve().parents[1]
DEFERRED = (
    'vishwas-khata-demo.mp4', 'Vishwas_Khata_Venue_Backup.zip',
    'Vishwas_Khata_Finale.pptx', 'Vishwas_Khata_Finale.pdf',
)


def main():
    source = ROOT / 'Project_Vishwas_Khata_V3'
    checks = []
    for line in (source / 'SHA256_MANIFEST.txt').read_text(encoding='utf-8').splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((source / name).read_bytes()).hexdigest() == digest, name
        checks.append(name)
    assert len(checks) == 34
    policy = json.loads((ROOT / 'docs/completion/ARTIFACT_FREEZE.json').read_text(encoding='utf-8'))
    if policy['final_assets_allowed'] is False:
        for name in DEFERRED:
            assert not (ROOT / 'docs/finale/assets' / name).exists(), 'Deferred output unexpectedly present: ' + name
    tracked = [p for p in subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode('utf-8').split('\0') if p]
    # Staged deletions are absent; check every remaining tracked file and built asset.
    forbidden = {'.env', 'private', 'data', '.venv', 'node_modules'}
    for rel in tracked:
        assert not forbidden.intersection(Path(rel).parts), 'Private/runtime path tracked'
        assert Path(rel).suffix.lower() not in ('.wav', '.mp3', '.sqlite3', '.db'), 'Private audio/database tracked'
    key = (dotenv_values(ROOT / '.env').get('SARVAM_API_KEY') or '').encode()
    candidates = [ROOT / p for p in tracked] + list((ROOT / 'apps/web/dist').rglob('*'))
    # Include newly authored completion evidence before git add as well.
    candidates += list((ROOT / 'docs/completion').rglob('*')) + list((ROOT / 'docs/evidence').glob('*'))
    scanned = 0
    for path in set(candidates):
        if path.is_file():
            assert_no_secret(path.read_bytes(), key)
            scanned += 1
    for rel in ('.env', 'private/example.wav', 'private/voice-authorizations/example.json', 'data/example.sqlite3'):
        assert subprocess.run(['git', 'check-ignore', '-q', rel], cwd=ROOT).returncode == 0
    result = {'classification': 'APPLICATION_ONLY_SOURCE_AND_SECURITY_VERIFICATION',
              'original_files_sha256_match': len(checks), 'deferred_outputs_absent': [name for name in DEFERRED if not (ROOT / 'docs/finale/assets' / name).exists()],
              'final_generation_enabled': policy['final_assets_allowed'], 'explicit_release_switch_required': True, 'files_scanned': scanned, 'secret_found': False,
              'private_paths_ignored_untracked': True, 'provider_requests': 0}
    (ROOT / 'docs/evidence/application-only-verification.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
