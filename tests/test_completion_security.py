from contextlib import contextmanager,closing
import hashlib
import json
import sqlite3
import pytest
from apps.api import manage
from apps.api.config import Settings,SPEC
from apps.api.db import connect
from test_finance_http import env,new_draft,confirm


def test_actual_readonly_sqlite_failure_rolls_back_and_is_sanitized(env,monkeypatch):
    s,a,c=env;d=new_draft(c)
    @contextmanager
    def readonly(path):
        db=sqlite3.connect('file:'+path.as_posix()+'?mode=ro',uri=True,isolation_level=None)
        db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON')
        try:
            db.execute('BEGIN IMMEDIATE');yield db;db.commit()
        except BaseException:db.rollback();raise
        finally:db.close()
    import apps.api.main as main
    with monkeypatch.context() as patch:
        patch.setattr(main,'transaction',readonly)
        response=confirm(c,d)
        assert response.status_code==503 and 'readonly' not in response.text.lower()
    assert c.get('/v1/ledger/entries').json()['items']==[]
    assert confirm(c,d).status_code==201


@pytest.mark.parametrize('change',['bytes','real-flag','amount','source'])
def test_corrupted_fixture_is_refused_before_any_database_write(tmp_path,monkeypatch,change):
    folder=tmp_path/'source';(folder/'fixtures').mkdir(parents=True)
    original=(SPEC/'fixtures/demo_dataset.json').read_bytes();data=json.loads(original)
    if change=='real-flag':data['merchant']['simulated']=False
    if change=='amount':data['sales_events'][0]['amount_paise']=True
    if change=='source':data['sales_events'][0]['source']='MANUAL_OBSERVATION'
    raw=b'corrupted-json' if change=='bytes' else json.dumps(data).encode()
    (folder/'fixtures/demo_dataset.json').write_bytes(raw)
    # Classification guards are independent even if a local operator rewrites the manifest.
    (folder/'SHA256_MANIFEST.txt').write_text(hashlib.sha256(original if change=='bytes' else raw).hexdigest()+'  fixtures/demo_dataset.json\n')
    monkeypatch.setattr(manage,'SPEC',folder)
    target=tmp_path/'must-not-exist.sqlite3'
    with pytest.raises(RuntimeError,match='fixture'):
        manage.seed(Settings(database_path=target))
    assert not target.exists()


def test_headers_traversal_origins_and_transcript_bounds(env):
    s,a,c=env
    for length in ('bad','-1'):
        assert c.post('/v1/customers',content=b'{}',headers={'Content-Length':length,'Content-Type':'application/json'}).status_code==400
    for path in ('/.env','/%2e%2e/.env','/apps/api/config.py','/data/vishwas.sqlite3'):
        assert c.get(path).status_code in (400,404)
    response=c.get('/v1/health/ready')
    assert "script-src 'self'" in response.headers['content-security-policy']
    assert response.headers['x-frame-options']=='DENY'
    assert 'microphone=(self)' in response.headers['permissions-policy']
    assert c.post('/v1/ledger/drafts',json={'transcript':'x'*10000,'language':'en-IN'}).status_code==422
    assert c.post('/v1/demo/session',headers={'Origin':'https://untrusted.example'}).status_code==403
