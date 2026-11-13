from contextlib import closing
from apps.api.db import connect
from test_finance_http import env


def test_creation_intent_replays_and_conflicts_without_money(env):
    s,a,c=env;body={'transcript':'Ramesh took 500 credit','language':'en-IN'};header={'Client-Operation-Id':'draft-creation-001'}
    first=c.post('/v1/ledger/drafts',json=body,headers=header)
    replay=c.post('/v1/ledger/drafts',json=body,headers=header)
    assert first.status_code==201 and replay.status_code==200
    assert first.json()['draft_id']==replay.json()['draft_id']
    assert c.post('/v1/ledger/drafts',json={**body,'transcript':'Ramesh took 600 credit'},headers=header).status_code==409
    with closing(connect(s.database_path)) as db:
        assert db.execute('SELECT COUNT(*) FROM ledger_drafts').fetchone()[0]==1
        assert db.execute('SELECT COUNT(*) FROM ledger_entries').fetchone()[0]==0
        assert db.execute("SELECT COUNT(*) FROM audit_events WHERE action='DRAFT_CREATE'").fetchone()[0]==1


def test_server_reports_expiry_without_mutating_or_posting(env):
    s,a,c=env;d=c.post('/v1/ledger/drafts',json={'transcript':'Ramesh took 500 credit','language':'en-IN'}).json()
    s.as_of='2026-10-27T17:31:00Z'
    assert c.get('/v1/ledger/drafts/'+d['draft_id']).json()['state']=='EXPIRED'
    assert c.get('/v1/ledger/entries').json()['items']==[]
