"""Export a reviewed text-only Hyderabad source commit into a new root commit."""
import argparse
from hashlib import sha256
import io
import json
from pathlib import Path
import re
import subprocess
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {'.env.example', '.gitattributes', '.gitignore', 'README.md',
              'requirements.txt', 'requirements-lock.txt', 'requirements-dev.txt'}
TEXT_SUFFIXES = {'.css', '.csv', '.html', '.json', '.md', '.mjs', '.mmd', '.ps1',
                 '.py', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml'}
HYDERABAD_DOCS = {'CLAIMS_REGISTER.md', 'DEMO_CHECKLIST.md', 'DEMO_SCRIPT.md', 'EVAL_RESULTS_FINAL.csv',
                  'IMPLEMENTATION_STATUS.md', 'KNOWN_LIMITATIONS.md', 'RELEASE_READINESS.md',
                  'SOURCE_PROVENANCE.md', 'TEST_EVIDENCE.md', 'V3_IMPLEMENTATION_CROSSWALK.md',
                  'VENUE_RUNBOOK.md', 'LAPTOP_BROWSER_WITNESS.md', 'PUBLISH_CHECKLIST.md'}
INHERITED_RUNTIME_METADATA = {'docs/completion/ARTIFACT_FREEZE.json', 'docs/completion/TTS_REPLAY_SNAPSHOT.json',
                              'docs/decisions/ADR-030-sqlite-repayment-commitments.md'}
PRIVATE_PARTS = {'.git', '.tmp', '.venv', 'private', 'data', 'node_modules', 'dist', '__pycache__'}
SECRET = re.compile(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{30,}|'
                    rb'github_pat_[A-Za-z0-9_]{25,}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16})')


def git(*args, cwd=ROOT):
    return subprocess.check_output(['git', *args], cwd=cwd)


def allowed(path):
    if path in ROOT_FILES or path in INHERITED_RUNTIME_METADATA:
        return True
    name = Path(path)
    if PRIVATE_PARTS.intersection(name.parts) or name.suffix.lower() not in TEXT_SUFFIXES:
        return False
    if path.startswith(('apps/api/', 'apps/web/', 'tests/', 'scripts/', 'Project_Vishwas_Khata_V3/',
                        'docs/hyderabad/reference/')):
        return True
    return name.parent.as_posix() == 'docs/hyderabad' and name.name in HYDERABAD_DOCS


def export(source, destination):
    sha = git('rev-parse', '--verify', f'{source}^{{commit}}').decode().strip()
    paths = [item.decode() for item in git('ls-tree', '-r', '--name-only', '-z', sha).split(b'\0') if item]
    selected = [path for path in paths if allowed(path)]
    if not {'README.md', 'apps/api/migrations/008_hyd_commitments.sql', 'docs/hyderabad/SOURCE_PROVENANCE.md'} <= set(selected):
        raise ValueError('Missing required release source')
    files = {}
    with ZipFile(io.BytesIO(git('archive', '--format=zip', sha, '--', *selected))) as archive:
        for path in selected:
            raw = archive.read(path)
            if path == 'README.md':
                raw = raw.split(b'# Historical Bangalore release')[0].rstrip() + b'\n'
            raw.decode('utf-8')
            if b'\0' in raw or SECRET.search(raw):
                raise ValueError(f'Review possible private or binary content in {path}')
            files[path] = raw

    destination.mkdir(parents=True, exist_ok=False)
    for name, raw in files.items():
        path = destination / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
    manifest = {'canonical_source_commit': sha, 'files': {path: sha256(raw).hexdigest() for path, raw in files.items()}}
    (destination / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    # Historical reference bytes are already protected by .gitattributes.
    git('init', '--initial-branch=main', cwd=destination)
    git('add', '--', '.', cwd=destination)
    git('-c', 'user.name=Vishwas-Khata-AI source release',
        '-c', 'user.email=vishwas-khata-ai@users.noreply.github.com',
        'commit', '-m', 'Publish reviewed Vishwas-Khata-AI Hyderabad source snapshot', cwd=destination)
    for path, raw in files.items():
        if git('show', 'HEAD:' + path, cwd=destination) != raw:
            raise ValueError(f'Export changed tracked source bytes in {path}')
    print(json.dumps({'canonical_source_commit': sha, 'source_snapshot_commit': git('rev-parse', 'HEAD', cwd=destination).decode().strip(),
                      'reviewed_text_files': len(files), 'snapshot': str(destination)}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--source', default='HEAD')
    args = parser.parse_args()
    target = args.destination.resolve()
    if target.is_relative_to(ROOT):
        parser.error('Choose a new folder outside the canonical checkout.')
    export(args.source, target)


if __name__ == '__main__':
    main()
