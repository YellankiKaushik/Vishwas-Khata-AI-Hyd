"""python -m apps.api.manage seed|migrate|reset. Reset archives only this demo DB."""
import argparse
import hashlib
import json
from datetime import datetime, timezone

from .config import Settings, SPEC, ROOT
from .db import migrate, transaction, connect


def checked_fixture():
    raw=(SPEC/'fixtures/demo_dataset.json').read_bytes()
    digest=hashlib.sha256(raw).hexdigest()
    expected=next((line.split('  ',1)[0] for line in (SPEC/'SHA256_MANIFEST.txt').read_text(encoding='utf-8').splitlines() if line.endswith('  fixtures/demo_dataset.json')),None)
    if digest!=expected:
        raise RuntimeError('Synthetic fixture checksum mismatch; original source must be restored before seed.')
    try:
        fixture=json.loads(raw)
        if fixture['dataset_classification']!='SYNTHETIC_ONLY' or fixture['merchant']['simulated'] is not True:
            raise ValueError('synthetic declaration required')
        customers={c['id'] for c in fixture['customers']}
        if fixture['merchant']['timezone']!='Asia/Kolkata' or fixture['ledger_entries']:
            raise ValueError('fixture scope mismatch')
        for event in fixture['sales_events']+fixture['visit_events']:
            if event['source']!='FIXTURE' or event['simulated'] is not True:
                raise ValueError('event provenance mismatch')
            if datetime.fromisoformat(event['observed_at'].replace('Z','+00:00')).tzinfo is None:
                raise ValueError('timezone required')
            if 'amount_paise' in event and (type(event['amount_paise']) is not int or not 0<event['amount_paise']<=100000000):
                raise ValueError('integer paise required')
            if 'customer_id' in event and event['customer_id'] not in customers:
                raise ValueError('unowned fixture customer')
    except (KeyError,TypeError,ValueError) as exc:
        raise RuntimeError('Synthetic fixture failed classification, source or field validation.') from exc
    return fixture,digest


def seed(settings: Settings):
    if not settings.demo_mode:
        raise RuntimeError('Demo seed requires DEMO_MODE=true')
    fixture,digest=checked_fixture()
    revisions = migrate(settings.database_path)
    with transaction(settings.database_path) as db:
        existing = db.execute('SELECT sha256 FROM seed_runs WHERE fixture_version=?', (fixture['fixture_version'],)).fetchone()
        if existing:
            if existing[0] != digest:
                raise RuntimeError('Fixture changed: explicit reset required')
            return {'seed': 'already_applied', 'migrations': revisions}
        m = fixture['merchant']
        db.execute('INSERT INTO merchants VALUES (?,?,?,?,?)', (m['id'], m['display_name'], m['timezone'], 1, m['created_at']))
        for c in fixture['customers']:
            db.execute('INSERT INTO customers VALUES (?,?,?,?,?,NULL)', (c['id'], m['id'], c['display_name'], c['normalized_name'], c['created_at']))
        for s in fixture['sales_events']:
            db.execute('INSERT INTO sales_events(id,merchant_id,amount_paise,observed_at,source,simulated) VALUES (?,?,?,?,?,1)',
                       (s['id'], m['id'], s['amount_paise'], s['observed_at'], 'FIXTURE'))
        for v in fixture['visit_events']:
            db.execute('INSERT INTO visit_events(id,merchant_id,customer_id,observed_at,source,simulated) VALUES (?,?,?,?,?,1)',
                       (v['id'], m['id'], v['customer_id'], v['observed_at'], 'FIXTURE'))
        db.execute('INSERT INTO seed_runs VALUES (?,?)', (fixture['fixture_version'], digest))
    return {'seed': 'applied', 'migrations': revisions, 'fixture_sha256': digest}


def reset(settings: Settings):
    target = settings.database_path.resolve()
    # A reset cannot target arbitrary user databases, or a real merchant store.
    if not settings.demo_mode or target != (ROOT / 'data/vishwas.sqlite3').resolve():
        raise RuntimeError('Reset allowed only for the default synthetic demo database')
    if target.exists():
        db = connect(target)
        try:
            if db.execute('SELECT 1 FROM merchants WHERE simulated!=1').fetchone():
                raise RuntimeError('Non-synthetic merchant present; reset refused')
            db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
        finally:
            db.close()
        archive = target.with_name('vishwas-backup-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '.sqlite3')
        target.rename(archive)
        # Only exact sidecar files under the verified default directory.
        for suffix in ('-wal', '-shm'):
            sidecar = target.with_name(target.name + suffix)
            if sidecar.exists():
                sidecar.unlink()
    return seed(settings)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['seed', 'migrate', 'reset'])
    command = parser.parse_args().command
    settings = Settings.environment()
    print(json.dumps(migrate(settings.database_path) if command == 'migrate' else globals()[command](settings), indent=2))
