from contextlib import closing
import json
import sqlite3

import pytest

from apps.api.config import utc_text, SPEC
from apps.api.db import connect, migrate
from test_finance_http import env, new_draft, confirm


def daily(c, day='2026-10-27', extra=''):
    r = c.get('/v1/insights/daily?date='+day+extra)
    assert r.status_code == 200, r.text
    return r.json()


def sale(c, **kw):
    return c.post('/v1/observations/sales', json={'amount_paise':12345,'observed_at':'2026-10-27T07:00:00Z','source':'MANUAL_OBSERVATION','client_operation_id':'sale-operation-001',**kw})


def test_fixture_facts_four_slots_gap_sources(env):
    _, _, c = env
    f = daily(c)
    assert f['observed_sales_paise'] == 910000
    assert f['observation_coverage'] == 'PARTIAL_UNVERIFIED'
    assert f['window_start_utc'].startswith('2026-10-26T18:30:00')
    assert f['window_end_utc'].startswith('2026-10-27T18:30:00')
    g = next(g for g in f['visit_observations'] if g['customer_id']=='cus_priya')
    assert (g['gap_days'],g['median_interval_days'],g['threshold_days']) == (12,4,8)
    assert len(g['source_event_ids']) == 3
    b = c.get('/v1/briefings/daily?date=2026-10-27').json()
    assert [s['type'] for s in b['slots']] == ['SALES','RECORD_READINESS','CUSTOMER_INACTIVITY','WHAT_IF']
    assert 'not proof that the customer stopped visiting' in b['slots'][2]['text']
    assert 'INSUFFICIENT_DATA' in b['slots'][3]['text']
    assert all(set(s['fact_ids'])<=set(x['fact_id'] for x in f['facts']) for s in b['slots'])
    assert b == c.get('/v1/briefings/daily?date=2026-10-27').json()
    assert c.get('/v1/briefings/daily?date=2026-10-27&language=hi-IN').json()['error']['code'] == 'UNSUPPORTED_NARRATIVE_LANGUAGE'


def test_no_sales_credit_separate_and_reversals_reconcile(env):
    settings, _, c = env
    settings.as_of = '2026-10-28T10:00:00Z'
    assert c.post('/v1/demo/session').status_code == 200
    credit = confirm(c,new_draft(c)).json()
    confirm(c,new_draft(c,20000,'REPAYMENT_RECEIVED'),'repay-key-001')
    f = daily(c,'2026-10-28')
    assert f['observed_sales_paise'] is None
    assert f['observation_coverage'] == 'NO_DATA'
    assert (f['credit_given_paise'],f['repayments_received_paise'],f['receivables_net_change_paise']) == (50000,20000,30000)
    assert c.post('/v1/ledger/entries/'+credit['entry_id']+'/reverse',json={'confirm':True,'reason':'Would be negative'},headers={'Idempotency-Key':'reverse-key-001'}).status_code == 409
    text = c.get('/v1/briefings/daily?date=2026-10-28').json()['slots'][0]['text']
    assert 'NO_DATA' in text and 'Credit is not sales' in text


def test_observation_idempotency_void_hash_invalidation(env):
    settings, _, c = env
    before = c.get('/v1/briefings/daily?date=2026-10-27').json()
    r = sale(c)
    assert r.status_code == 201
    assert sale(c).status_code == 200
    assert sale(c).json()['id'] == r.json()['id']
    assert sale(c,amount_paise=12346).status_code == 409
    assert sale(c,note='Divergent note').status_code == 409
    assert daily(c)['observed_sales_paise'] == 922345
    after = c.get('/v1/briefings/daily?date=2026-10-27').json()
    assert after['facts_hash'] != before['facts_hash']
    vid = r.json()['id']
    path = '/v1/observations/sales/'+vid+'/void'
    assert c.post(path,json={'confirm':False,'reason':'Wrong amount'}).status_code == 422
    voided = c.post(path,json={'confirm':True,'reason':'Wrong amount'})
    assert voided.status_code == 201
    assert c.post(path,json={'confirm':True,'reason':'Wrong amount'}).json()['id'] == voided.json()['id']
    assert daily(c)['observed_sales_paise'] == 910000
    assert c.get('/v1/briefings/daily?date=2026-10-27').json()['facts_hash'] == before['facts_hash']
    with closing(connect(settings.database_path)) as db:
        assert db.execute('SELECT COUNT(*) FROM sales_events WHERE id=?',(vid,)).fetchone()[0] == 1
        for query in ('UPDATE sales_events SET amount_paise=1','DELETE FROM sales_events','DELETE FROM observation_voids'):
            with pytest.raises(sqlite3.IntegrityError):db.execute(query)


@pytest.mark.parametrize('payload',[
    {'observed_at':'2026-10-27T07:00:00'},
    {'observed_at':'2026-10-28T07:00:00Z'},
    {'amount_paise':True},
    {'amount_paise':100000001},
    {'source':'FIXTURE'},
    {'merchant_id':'forged'},
    {'simulated':False},
])
def test_source_time_amount_identity_validation(env,payload):
    r=sale(env[2],**payload)
    assert r.status_code in (403,422)


def test_timezone_future_cutoff_and_future_report(env):
    _, _, c = env
    assert daily(c,extra='&as_of=2026-10-27T07:00:00Z')['observed_sales_paise'] is None
    assert c.get('/v1/insights/daily?date=2026-10-28').status_code == 422
    assert c.get('/v1/insights/daily?date=2026-10-27&as_of=2026-10-28T17:00:00Z').status_code == 422
    assert sale(c,observed_at='2026-10-26T19:00:00Z').status_code == 201
    assert daily(c)['observed_sales_paise'] == 922345
    assert daily(c,'2026-10-26')['observed_sales_paise'] == 840000
    # The next IST midnight is excluded, while an event at current cutoff is included.
    assert sale(c,observed_at='2026-10-26T18:30:00+00:00',client_operation_id='boundary-operation-001').status_code==201
    assert daily(c)['observed_sales_paise'] == 934690


def test_visits_distinct_dates_void_and_manual_suggestions(env):
    _, _, c = env
    payload={'customer_id':'cus_priya','observed_at':'2026-10-15T11:00:00Z','source':'MANUAL_OBSERVATION','client_operation_id':'visit-operation-001'}
    r=c.post('/v1/observations/visits',json=payload)
    assert r.status_code == 201
    assert c.post('/v1/observations/visits',json=payload).status_code == 200
    assert c.post('/v1/observations/visits',json={**payload,'customer_id':'cus_ramesh'}).status_code == 409
    g=next(g for g in daily(c)['visit_observations'] if g['customer_id']=='cus_priya')
    assert g['median_interval_days']==4 and len(g['recorded_dates'])==3
    items=c.get('/v1/suggestions').json()['items']
    assert len(items)==1
    edited=c.patch('/v1/suggestions/'+items[0]['id'],json={'state':'DONE_MANUALLY'})
    assert edited.status_code==200 and edited.json()['state']=='DONE_MANUALLY'
    for oid in ('visit_priya_1007','visit_priya_1011'):
        assert c.post('/v1/observations/visits/'+oid+'/void',json={'confirm':True,'reason':'Correcting invented visit'}).status_code==201
    g=next(g for g in daily(c)['visit_observations'] if g['customer_id']=='cus_priya')
    assert g['status']=='INSUFFICIENT_VISIT_HISTORY'
    assert c.get('/v1/suggestions').json()['items']==[]


def test_tenant_void_customer_link_and_no_data(env):
    settings,app,c=env
    from apps.api.db import transaction
    with transaction(settings.database_path) as db:
        db.execute("INSERT INTO merchants VALUES ('other','Other synthetic shop','Asia/Kolkata',1,?)",(utc_text(settings.now()),))
    app.dependency_overrides[app.state.merchant_dependency]=lambda:'other'
    assert sale(c).status_code==201
    assert c.post('/v1/observations/visits',json={'customer_id':'cus_priya','observed_at':'2026-10-20T07:00:00Z','source':'MANUAL_OBSERVATION','client_operation_id':'other-visit-001'}).status_code==404
    assert c.post('/v1/observations/sales/sale_1027/void',json={'confirm':True,'reason':'Not our record'}).status_code==404
    assert daily(c)['visit_observations']==[]


def test_migration_runner_preserves_valid_v2_history_stops_mismatch(tmp_path):
    for mismatch in (False,True):
        path=tmp_path / f'old-{mismatch}.sqlite3'
        db=connect(path)
        db.executescript((SPEC/'schema/001_initial.sql').read_text()+(SPEC/'schema/002_integrity_hardening.sql').read_text())
        db.execute("INSERT INTO merchants VALUES ('m','Synthetic','Asia/Kolkata',1,'2026-10-20T00:00:00Z')")
        db.execute("INSERT INTO customers VALUES ('c','m','Alias','alias','2026-10-20T00:00:00Z',NULL)")
        db.execute("INSERT INTO ledger_drafts(id,merchant_id,customer_id,entry_type,amount_paise,state,created_at,updated_at,expires_at) VALUES ('d','m','c','CREDIT_GIVEN',50000,'CONFIRMED','2026-10-20T00:00:00Z','2026-10-20T00:00:00Z','2026-10-21T00:00:00Z')")
        db.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES ('e','m','c','d','CREDIT_GIVEN',?,'2026-10-20T00:00:00Z','MANUAL','local',1)",(49999 if mismatch else 50000,))
        db.close()
        if mismatch:
            with pytest.raises(RuntimeError,match='Historical journal mismatch'):migrate(path)
        else:
            migrate(path)
        with closing(connect(path)) as db:
            assert db.execute('SELECT amount_paise_signed FROM ledger_entries').fetchone()[0]==(49999 if mismatch else 50000)
