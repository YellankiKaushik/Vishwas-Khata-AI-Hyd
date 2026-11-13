"""Build and inspect an explicit allowlist of portable offline demonstration assets."""
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
from pathlib import Path
import zipfile

from dotenv import dotenv_values

ROOT=Path(__file__).resolve().parents[1]


def assert_no_secret(data, key):
    if key and key in data:
        raise RuntimeError('Private credential found in a deliverable; packaging stopped.')
    if zipfile.is_zipfile(BytesIO(data)):
        with zipfile.ZipFile(BytesIO(data)) as nested:
            for name in nested.namelist():
                assert_no_secret(nested.read(name),key)


def main():
    from artifact_policy import require_final_asset_phase
    require_final_asset_phase()
    files=[
        'docs/finale/assets/vishwas-khata-demo.mp4','docs/finale/assets/Vishwas_Khata_Finale.pptx',
        'docs/finale/assets/Vishwas_Khata_Finale.pdf','DEMO_GUIDE.md','DEMO_BACKUP.md','KNOWN_LIMITATIONS.md',
        'docs/finale/FINAL_VERIFICATION_REPORT.md','docs/finale/UPDATED_PITCH_CLAIMS.md','docs/finale/JUDGE_QA.md',
        'docs/finale/HACKATHON_RULES_CONFIRMATION.md','docs/finale/LIVE_VOICE_ACCEPTANCE.md',
        'docs/evidence/f3-live-tts.json','docs/evidence/f3-browser-audio.json',
    ]
    files += ['docs/evidence/'+name for name in ('01-overview-desktop.png','02-confirmation-review.png','03-signed-journal.png',
              '04-four-part-briefing.png','05-source-evidence.png','06-overview-mobile.png','06b-overview-mobile-viewport.png',
              'f4-capture-1366.png','f4-capture-1600.png','f4-capture-390.png')]
    files += [f'docs/finale/slides/slide-{n:02}.png' for n in range(1,11)]
    files += ['FINAL_OPERATOR_ACTIONS.md','README.md','.env.example','requirements.txt','requirements-lock.txt',
              'docs/completion/ARTIFACT_FREEZE.json','docs/completion/FINAL_VOICE_VERIFICATION.md',
              'docs/evidence/release-dependencies.txt']
    files += [str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'docs/release').glob('*') if p.is_file()]
    # Recoverable source + compiled UI; installed runtimes/dependencies remain on the prepared laptop.
    for directory, patterns in [('apps/api',['*.py','*.sql']),('apps/web/dist',['*']),
                                 ('apps/web/src',['*']),('migrations',['*.sql']),
                                 ('scripts',['*.ps1','*.py','*.mjs'])]:
        for pattern in patterns:
            files += [str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/directory).rglob(pattern)
                      if p.is_file() and '__pycache__' not in p.parts]
    files += ['apps/web/package.json','apps/web/package-lock.json']
    import subprocess
    tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
    files += [p for p in tracked if p and (p.startswith(('Project_Vishwas_Khata_V3/','tests/','contracts/','evaluation/','apps/web/e2e/'))
              or p in ('apps/web/index.html','apps/web/tsconfig.json','apps/web/vite.config.ts','apps/web/playwright.config.ts','apps/__init__.py'))]
    files = list(dict.fromkeys(files))
    key=(dotenv_values(ROOT/'.env').get('SARVAM_API_KEY') or '').encode()
    entries=[]
    payloads=[]
    for relative in files:
        path=ROOT/relative
        if not path.is_file():raise RuntimeError(f'Required final asset missing: {relative}')
        data=path.read_bytes();assert_no_secret(data,key)
        payloads.append((relative,data))
        entries.append({'path':relative,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                        'last_generated_utc':datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),
                        'provenance':'Actual runtime capture' if path.suffix=='.png' and 'evidence' in relative else 'Final source-derived submission artifact'})
    archive=ROOT/'docs/finale/assets/Vishwas_Khata_Venue_Backup.zip'
    temporary=archive.with_suffix('.zip.tmp')
    overview=('Vishwas Khata — Team Tic Tac Tech\n\n'
              'This is an OFFLINE SOURCE/COMPILED-UI/ASSET BACKUP; installed runtimes are excluded.\n'
              'For the actual prototype, retain the full existing repository with installed dependencies.\n'
              'Run ./scripts/demo.ps1 -Replay from that repository; open http://127.0.0.1:8000.\n'
              'Video: actual 135-second typed workflow, silent/captioned.\n'
              'PPTX: editable source. PDF: ten image-based slide pages for portable viewing.\n'
              'Live voice audio is NOT included. One authenticated TTS response is documented, human witness pending.\n'
              'STT: two actual English recordings passed; all six fields correct. Approval consumed.\n'
              'No ongoing paid calls. No real data, Paytm APIs or payment movement.\n'
              'Read DEMO_GUIDE.md and DEMO_BACKUP.md. Event rules are unknown until organizer confirmation.\n')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_DEFLATED) as output:
        for name,data in payloads:output.writestr(name,data)
        output.writestr('OPEN_FIRST.txt',overview)
        output.writestr('ASSET_MANIFEST.json',json.dumps({'generated_at_utc':datetime.now(timezone.utc).isoformat(),
                         'live_voice_audio_included':False,'assets':entries},indent=2))
    with zipfile.ZipFile(temporary) as output:
        assert output.testzip() is None
        for name in output.namelist():
            path=Path(name)
            assert not path.is_absolute() and '..' not in path.parts
            assert not any(part in ('.env','private','data','node_modules','.venv','.git') for part in path.parts)
            assert path.suffix not in ('.wav','.mp3','.sqlite3','.db')
            assert_no_secret(output.read(name),key)
    temporary.replace(archive)
    report={'classification':'VERIFIED_ALLOWLIST_OFFLINE_ASSET_ARCHIVE','archive':str(archive.relative_to(ROOT)),
            'archive_bytes':archive.stat().st_size,'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'assets':entries,'private_or_dependency_or_database_files':0,'live_voice_audio_included':False,
            'actual_tts_request_metadata_included':True,'secret_found':False}
    (ROOT/'docs/evidence/venue-package.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='assets'},indent=2))


if __name__=='__main__':main()
