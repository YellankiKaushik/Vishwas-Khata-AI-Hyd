"""V3 executable cross-contract checks; synthetic only, not application API tests."""
from __future__ import annotations
import sqlite3
import sys
import unittest
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'reference'))
from money_sqlite_reference import Context,new_db,create_draft,confirm,balance,DomainError
from observations_reference import record_observation,void_observation,recorded_sales,inactivity

class V3DatabaseTest(unittest.TestCase):
 def setUp(self):
  self.c=sqlite3.connect(':memory:',isolation_level=None)
  base=ROOT/'schema';new_db(self.c,(base/'001_initial.sql').read_text(),(base/'002_integrity_hardening.sql').read_text());self.c.executescript((base/'003_v3_contract_hardening.sql').read_text())
  for m in ('m1','m2'):
   self.c.execute('INSERT INTO merchants(id,display_name,created_at) VALUES(?,?,?)',(m,m,'2026-10-20T00:00:00Z'))
  for m,person in [('m1','ramesh'),('m1','priya'),('m2','else')]:
   self.c.execute('INSERT INTO customers(id,merchant_id,display_name,normalized_name,created_at) VALUES(?,?,?,?,?)',(person,m,person,person,'2026-10-20T00:00:00Z'))
 def tearDown(self):self.c.close()
 def draft(self,kind='CREDIT_GIVEN',amount=50000,token='x',customer='ramesh'):
  return create_draft(self.c,Context('m1'),customer,kind,amount,token=token)
 def post(self,**kw):
  d=self.draft(**kw);return confirm(self.c,Context('m1'),d,'post_'+d,at_utc=datetime(2026,10,27,6,0,tzinfo=timezone.utc))
 def test_valid_reference_post_still_works(self):
  self.post();self.post(kind='REPAYMENT_RECEIVED',amount=20000,token='y')
  self.assertEqual(balance(self.c,'m1','ramesh'),30000)
 def test_database_rejects_post_different_amount_from_draft(self):
  d=self.draft()
  with self.assertRaisesRegex(sqlite3.IntegrityError,'POST_MISMATCHES_CONFIRMED_DRAFT'):
   self.c.execute('''INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES (?,?,?,?,?,?,?,?,?,1)''',('bad','m1','ramesh',d,'CREDIT_GIVEN',60000,'2026-10-27T06:00:00Z','MANUAL','demo'))
 def test_database_rejects_post_wrong_draft_type(self):
  d=self.draft()
  with self.assertRaises(sqlite3.IntegrityError):
   self.c.execute('''INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES (?,?,?,?,?,?,?,?,?,1)''',('bad','m1','ramesh',d,'REPAYMENT_RECEIVED',-50000,'2026-10-27T06:00:00Z','MANUAL','demo'))
 def test_database_rejects_simulated_money_mismatch(self):
  d=self.draft()
  with self.assertRaises(sqlite3.IntegrityError):
   self.c.execute('''INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES (?,?,?,?,?,?,?,?,?,0)''',('bad','m1','ramesh',d,'CREDIT_GIVEN',50000,'2026-10-27T06:00:00Z','MANUAL','demo'))
 def test_database_rejects_amount_over_cap(self):
  d=self.draft(amount=50000)
  with self.assertRaises(sqlite3.IntegrityError):
   self.c.execute('''INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES (?,?,?,?,?,?,?,?,?,1)''',('bad','m1','ramesh',d,'CREDIT_GIVEN',100000001,'2026-10-27T06:00:00Z','MANUAL','demo'))
 def test_confirmed_draft_cannot_change(self):
  d=self.draft();confirm(self.c,Context('m1'),d,'k-123',at_utc=datetime(2026,10,27,6,0,tzinfo=timezone.utc))
  with self.assertRaises(sqlite3.IntegrityError):
   self.c.execute('UPDATE ledger_drafts SET amount_paise=120000 WHERE id=?',(d,))
  self.assertEqual(self.c.execute('SELECT amount_paise FROM ledger_drafts WHERE id=?',(d,)).fetchone()[0],50000)
 def test_confirm_state_requires_journal_post(self):
  d=self.draft()
  with self.assertRaisesRegex(sqlite3.IntegrityError,'CONFIRM_REQUIRES_POST'):
   self.c.execute("UPDATE ledger_drafts SET state='CONFIRMED' WHERE id=?",(d,))
 def test_sales_replay_safe(self):
  args=dict(source='MANUAL_OBSERVATION',observed_at='2026-10-26T19:00:00Z',client_operation_id='sale-op-001',amount_paise=5000)
  a=record_observation(self.c,'m1','SALE',**args);b=record_observation(self.c,'m1','SALE',**args)
  self.assertEqual(a,b)
  self.assertEqual(self.c.execute('SELECT COUNT(*) FROM sales_events').fetchone()[0],1)
 def test_sales_replay_conflicting_payload_rejected(self):
  args=dict(source='MANUAL_OBSERVATION',observed_at='2026-10-26T19:00:00Z',client_operation_id='sale-op-001',amount_paise=5000)
  record_observation(self.c,'m1','SALE',**args)
  args['amount_paise']=6000
  with self.assertRaisesRegex(DomainError,'OBSERVATION_OPERATION_CONFLICT'):
   record_observation(self.c,'m1','SALE',**args)
 def test_sales_observations_are_not_complete_revenue(self):
  record_observation(self.c,'m1','SALE',source='FIXTURE',observed_at='2026-10-26T19:00:00Z',client_operation_id='sale-001-x',amount_paise=5000)
  x=recorded_sales(self.c,'m1','2026-10-27')
  self.assertEqual(x['observation_coverage'],'PARTIAL_UNVERIFIED');self.assertEqual(x['observed_sales_paise'],5000)
 def test_void_sales_removes_count_but_preserves_event(self):
  a=record_observation(self.c,'m1','SALE',source='FIXTURE',observed_at='2026-10-26T19:00:00Z',client_operation_id='sale-001-x',amount_paise=5000)
  x=void_observation(self.c,'m1','SALE',a,actor_id='demo',reason='mistyped amount')
  self.assertEqual(x,void_observation(self.c,'m1','SALE',a,actor_id='demo',reason='mistyped amount'))
  self.assertEqual(recorded_sales(self.c,'m1','2026-10-27')['observation_coverage'],'NO_DATA')
  self.assertEqual(self.c.execute('SELECT COUNT(*) FROM sales_events').fetchone()[0],1)
 def test_cross_merchant_void_forbidden(self):
  a=record_observation(self.c,'m1','SALE',source='FIXTURE',observed_at='2026-10-26T19:00:00Z',client_operation_id='sale-001-x',amount_paise=5000)
  with self.assertRaisesRegex(sqlite3.IntegrityError,'VOID_SOURCE_NOT_OWNED'):
   void_observation(self.c,'m2','SALE',a,actor_id='demo',reason='wrong identity')
 def test_observation_rows_immutable(self):
  a=record_observation(self.c,'m1','SALE',source='FIXTURE',observed_at='2026-10-26T19:00:00Z',client_operation_id='sale-001-x',amount_paise=5000)
  with self.assertRaises(sqlite3.IntegrityError):self.c.execute('UPDATE sales_events SET amount_paise=1 WHERE id=?',(a,))
  with self.assertRaises(sqlite3.IntegrityError):self.c.execute('DELETE FROM sales_events WHERE id=?',(a,))
 def test_customer_inactivity_exact_sample(self):
  for i,d in enumerate(['2026-10-07T10:00:00Z','2026-10-11T10:00:00Z','2026-10-15T10:00:00Z']):
   record_observation(self.c,'m1','VISIT',source='FIXTURE',observed_at=d,client_operation_id=f'visit-{i}-abc',customer_id='priya')
  result=inactivity(self.c,'m1','priya','2026-10-27')
  self.assertEqual(result['status'],'FLAG_RECORDED_GAP');self.assertEqual(result['days_since_last_recorded_visit'],12);self.assertEqual(result['threshold_days'],8)
 def test_inactivity_missing_visits_is_unknown(self):
  self.assertEqual(inactivity(self.c,'m1','priya','2026-10-27')['status'],'INSUFFICIENT_VISIT_HISTORY')
 def test_cross_merchant_visit_forbidden(self):
  with self.assertRaises(sqlite3.IntegrityError):
   record_observation(self.c,'m1','VISIT',source='FIXTURE',observed_at='2026-10-11T10:00:00Z',client_operation_id='visit-c-001',customer_id='else')
 def test_draft_edit_requires_version_bump(self):
  d=self.draft()
  with self.assertRaisesRegex(sqlite3.IntegrityError,'DRAFT_ECONOMIC_EDIT_MUST_INCREMENT_VERSION'):
   self.c.execute('UPDATE ledger_drafts SET amount_paise=25000 WHERE id=?',(d,))
  self.c.execute("UPDATE ledger_drafts SET amount_paise=25000,version=version+1 WHERE id=?",(d,))
  self.assertEqual(self.c.execute('SELECT version FROM ledger_drafts WHERE id=?',(d,)).fetchone()[0],2)
 def test_terminal_draft_cannot_be_reactivated(self):
  d=self.draft()
  self.c.execute("UPDATE ledger_drafts SET state='CANCELLED' WHERE id=?",(d,))
  with self.assertRaisesRegex(sqlite3.IntegrityError,'DRAFT_TERMINAL_STATE_IMMUTABLE'):
   self.c.execute("UPDATE ledger_drafts SET state='AWAITING_CONFIRMATION' WHERE id=?",(d,))
 def test_partial_day_does_not_include_future_event(self):
  record_observation(self.c,'m1','SALE',source='FIXTURE',observed_at='2026-10-27T13:00:00Z',client_operation_id='future-001',amount_paise=9000)
  self.assertEqual(recorded_sales(self.c,'m1','2026-10-27',as_of_utc='2026-10-27T10:00:00Z')['observation_coverage'],'NO_DATA')
 def test_visit_same_day_deduplication(self):
  arr=['2026-10-07T09:00:00Z','2026-10-07T10:00:00Z','2026-10-11T10:00:00Z','2026-10-15T10:00:00Z']
  for i,x in enumerate(arr):record_observation(self.c,'m1','VISIT',source='FIXTURE',observed_at=x,client_operation_id=f'visit-dupe-{i}',customer_id='priya')
  result=inactivity(self.c,'m1','priya','2026-10-27')
  self.assertEqual(result['typical_interval_days'],4)
  self.assertEqual(len(result['source_event_ids']),3)
 def test_sale_amount_cap_enforced_at_sql(self):
  with self.assertRaisesRegex(sqlite3.IntegrityError,'OBSERVED_SALE_AMOUNT_OUT_OF_BOUND'):
   self.c.execute("INSERT INTO sales_events(id,merchant_id,amount_paise,observed_at,source,simulated) VALUES('huge','m1',100000001,'2026-10-27T00:00:00Z','FIXTURE',1)")
 def test_schema_check(self):
  self.assertEqual(self.c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
  self.assertFalse(self.c.execute('PRAGMA foreign_key_check').fetchall())

if __name__=='__main__':unittest.main()
