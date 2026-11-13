"""Verify frozen source provenance and current publication files without network calls."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FROZEN = '03d8192b989ae9d1da212f318ff172a919043830'
TREE = 'ad842744a605517da3f4c63c9905ef781e312002'
SECRET = re.compile(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{25,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}')


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    assert git('rev-parse', FROZEN + '^{tree}').decode().strip() == TREE
    manifest = json.loads(git('show', FROZEN + ':SOURCE_MANIFEST.json'))
    assert len(manifest['files']) == 167
    # Read one archive instead of invoking a process for every blob.
    import io
    from zipfile import ZipFile
    with ZipFile(io.BytesIO(git('archive', '--format=zip', FROZEN))) as frozen:
        for name, digest in manifest['files'].items():
            assert hashlib.sha256(frozen.read(name)).hexdigest() == digest, name
        assert json.loads((ROOT / 'SOURCE_MANIFEST.json').read_text()) == manifest
        migrations = [name for name in manifest['files'] if '/migrations/' in name or '/schema/' in name]
        for name in migrations:
            assert (ROOT / name).read_bytes() == frozen.read(name), 'Historical migration changed: ' + name
    reference = ROOT / 'Project_Vishwas_Khata_V3'
    count = 0
    for line in (reference / 'SHA256_MANIFEST.txt').read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((reference / name).read_bytes()).hexdigest() == digest, name
        count += 1
    assert count == 34
    # The index is the publication set. New implementation files must be added
    # before this check; generated browser evidence remains untracked and private.
    paths = [name.decode() for name in git('ls-files', '-z').split(b'\0') if name]
    prohibited = {'.git', '.tmp', '.venv', 'private', 'data', 'node_modules', 'dist', '__pycache__', 'test-results'}
    for name in paths:
        p = Path(name)
        assert not prohibited.intersection(p.parts), name
        assert not (p.name.startswith('.env') and p.name != '.env.example'), name
        assert p.suffix.lower() not in {'.wav', '.mp3', '.mp4', '.db', '.sqlite', '.sqlite3', '.exe', '.dll', '.bundle', '.zip', '.png', '.jpg', '.pdf', '.pptx'}, name
        raw = (ROOT / name).read_bytes()
        raw.decode('utf-8')
        assert b'\0' not in raw and not SECRET.search(raw), 'Private or binary bytes: ' + name
    for name in ('.env', 'private/example.wav', 'data/example.sqlite3'):
        assert subprocess.run(['git', 'check-ignore', '-q', name], cwd=ROOT).returncode == 0
    result = {'classification': 'FROZEN_BASELINE_AND_CURRENT_SOURCE_SCAN', 'frozen_commit': FROZEN,
              'frozen_tree': TREE, 'frozen_manifest_matches': 167, 'reference_hashes': count,
              'preserved_migrations': len(migrations), 'publication_files_scanned': len(paths),
              'provider_requests': 0, 'secret_found': False}
    evidence = ROOT / '.tmp/master-evidence'
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / 'source-scan.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
