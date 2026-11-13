"""Recover the source package into a new workspace directory; never touch venue data."""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import zipfile

ROOT=Path(__file__).resolve().parents[1]


def main():
    archive=ROOT/'docs/finale/assets/Vishwas_Khata_Venue_Backup.zip'
    destination=Path(tempfile.mkdtemp(prefix='release-recovery-',dir=ROOT/'.tmp'))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for name in z.namelist():
            p=Path(name)
            assert not p.is_absolute() and '..' not in p.parts
            assert not set(p.parts)&{'private','.env','data','.git','node_modules','.venv'}
        manifest=json.loads(z.read('ASSET_MANIFEST.json'))
        for entry in manifest['assets']:
            assert hashlib.sha256(z.read(entry['path'])).hexdigest()==entry['sha256']
        z.extractall(destination)
    (destination/'.tmp').mkdir()
    env=os.environ.copy()
    env.update(DATABASE_PATH=str(destination/'isolated-recovery.sqlite3'),VOICE_PROVIDER='mock',
               LIVE_STT_ENABLED='false',LIVE_TTS_ENABLED='false',PYTHONUTF8='1',PYTHONPATH='')
    seed=subprocess.run([sys.executable,'-m','apps.api.manage','seed'],cwd=destination,env=env,capture_output=True,text=True,timeout=30)
    assert seed.returncode==0,seed.stderr
    selected=subprocess.run([sys.executable,'-m','pytest','tests/test_live_english_transcripts.py','-q','-p','no:cacheprovider',
                             '--basetemp=.tmp/recovery-pytest','--tb=short'],cwd=destination,env=env,capture_output=True,text=True,timeout=60)
    assert selected.returncode==0,selected.stdout+selected.stderr
    assert '7 passed' in selected.stdout
    assert (destination/'apps/web/dist/index.html').is_file()
    with sqlite3.connect(f'file:{ROOT / "data/vishwas.sqlite3"}?mode=ro',uri=True) as db:
        rows=db.execute('SELECT * FROM ledger_entries ORDER BY id').fetchall()
        venue={'rows':len(rows),'sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest(),
               'integrity':db.execute('PRAGMA integrity_check').fetchone()[0]}
    assert venue==json.loads((ROOT/'docs/evidence/release-venue-before.json').read_text())
    result={'classification':'VERIFIED_SOURCE_RECOVERY_WITH_EXISTING_INSTALLED_DEPENDENCIES',
            'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
            'manifest_entries_checked':len(manifest['assets']),'seed':json.loads(seed.stdout),
            'recovered_http_regressions_passed':7,'compiled_ui_present':True,'provider_calls':0,
            'venue_unchanged':venue,'clean_machine_dependency_install':'NOT_TESTED',
            'test_output':selected.stdout}
    (ROOT/'docs/evidence/release-recovery.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='test_output'},indent=2))


if __name__=='__main__':main()
