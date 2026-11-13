"""Real executable SQLite/finance reference checks; NOT a deployed API test."""
from __future__ import annotations
import sys
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'reference'))
from money_sqlite_reference import (Context,DomainError,new_db,create_draft,confirm as reference_confirm,reverse,balance,ist_business_day_bounds,observed_sales_for_business_day)

def confirm(conn, ctx, draft_id, key, **kw):
    return reference_confirm(conn, ctx, draft_id, key, at_utc=datetime(2026,10,27,6,0,tzinfo=timezone.utc), **kw)
SQL1=(ROOT/'schema/001_initial.sql').read_text()
SQL2=(ROOT/'schema/002_integrity_hardening.sql').read_text()

class ReferenceFinanceTest(unittest.TestCase):
    def setUp(self):
        self.cx=sqlite3.connect(':memory:',isolation_level=None)
        new_db(self.cx,SQL1,SQL2)
        for m in ('m1','m2'):
            self.cx.execute('INSERT INTO merchants(id,display_name,created_at) VALUES(?,?,?)',(m,m,'2026-10-27T00:00:00Z'))
        for m,c in [('m1','ramesh'),('m1','priya'),('m2','foreign')]:
            self.cx.execute('INSERT INTO customers(id,merchant_id,display_name,normalized_name,created_at) VALUES(?,?,?,?,?)',(c,m,c,c,'2026-10-27T00:00:00Z'))
        self.ctx=Context('m1')

    def tearDown(self): self.cx.close()
    def post(self,kind,amt,token,customer='ramesh'):
        d=create_draft(self.cx,self.ctx,customer,kind,amt,token=token)
        return confirm(self.cx,self.ctx,d,f'key_{token}')

    def test_v2_post_and_repayment_is_300_rupees(self):
        self.post('CREDIT_GIVEN',50000,'a')
        self.post('REPAYMENT_RECEIVED',20000,'b')
        self.assertEqual(balance(self.cx,'m1','ramesh'),30000)
        self.assertEqual(self.cx.execute('SELECT count(*) FROM audit_events').fetchone()[0],2)

    def test_idempotent_replay_exactly_same_row(self):
        d=create_draft(self.cx,self.ctx,'ramesh','CREDIT_GIVEN',50000,token='a')
        x=confirm(self.cx,self.ctx,d,'K1')
        y=confirm(self.cx,self.ctx,d,'K1')
        self.assertEqual(x,y)
        self.assertEqual(self.cx.execute('SELECT count(*) FROM ledger_entries').fetchone()[0],1)

    def test_same_key_different_fingerprint_rejected(self):
        d=create_draft(self.cx,self.ctx,'ramesh','CREDIT_GIVEN',50000,token='a')
        confirm(self.cx,self.ctx,d,'K1')
        with self.assertRaisesRegex(DomainError,'IDEMPOTENCY_CONFLICT'):
            confirm(self.cx,self.ctx,d,'K1',expected_version=2)

    def test_two_different_keys_cannot_post_same_draft_twice(self):
        d=create_draft(self.cx,self.ctx,'ramesh','CREDIT_GIVEN',50000,token='a')
        confirm(self.cx,self.ctx,d,'K1')
        with self.assertRaisesRegex(DomainError,'ALREADY_CONFIRMED'):
            confirm(self.cx,self.ctx,d,'K2')
        self.assertEqual(self.cx.execute('SELECT count(*) FROM ledger_entries').fetchone()[0],1)

    def test_overpayment_blocked_in_domain(self):
        self.post('CREDIT_GIVEN',50000,'a')
        d=create_draft(self.cx,self.ctx,'ramesh','REPAYMENT_RECEIVED',60000,token='b')
        with self.assertRaisesRegex(DomainError,'OVERPAYMENT'):
            confirm(self.cx,self.ctx,d,'K2')
        self.assertEqual(balance(self.cx,'m1','ramesh'),50000)

    def test_db_trigger_rejects_overpayment(self):
        self.post('CREDIT_GIVEN',50000,'a')
        d=create_draft(self.cx,self.ctx,'ramesh','REPAYMENT_RECEIVED',60000,token='b')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'NEGATIVE_RECEIVABLE_FORBIDDEN'):
            self.cx.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,draft_id,entry_type,amount_paise_signed,posted_at,source,actor_id,simulated) VALUES('bad','m1','ramesh',?,'REPAYMENT_RECEIVED',-60000,'2026-10-27T00:00:00Z','MANUAL','demo',1)",(d,))

    def test_immutable_journal(self):
        eid=self.post('CREDIT_GIVEN',50000,'a')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'IMMUTABLE_LEDGER_UPDATE'):
            self.cx.execute('UPDATE ledger_entries SET amount_paise_signed=1 WHERE id=?',(eid,))
        with self.assertRaisesRegex(sqlite3.IntegrityError,'IMMUTABLE_LEDGER_DELETE'):
            self.cx.execute('DELETE FROM ledger_entries WHERE id=?',(eid,))

    def test_valid_reversal_sign_and_original_unchanged(self):
        eid=self.post('CREDIT_GIVEN',50000,'a')
        reverse(self.cx,self.ctx,eid,reversal_id='rev1')
        self.assertEqual(balance(self.cx,'m1','ramesh'),0)
        self.assertEqual(self.cx.execute('SELECT amount_paise_signed FROM ledger_entries WHERE id=?',(eid,)).fetchone()[0],50000)

    def test_reversal_after_repayment_rejected(self):
        eid=self.post('CREDIT_GIVEN',50000,'a')
        self.post('REPAYMENT_RECEIVED',20000,'b')
        with self.assertRaisesRegex(DomainError,'NEGATIVE_RECEIVABLE_FORBIDDEN'):
            reverse(self.cx,self.ctx,eid,reversal_id='rev1')
        self.assertEqual(balance(self.cx,'m1','ramesh'),30000)

    def test_reversal_wrong_sign_rejected_by_trigger(self):
        eid=self.post('CREDIT_GIVEN',50000,'a')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'INVALID_REVERSAL_IDENTITY_OR_SIGN'):
            self.cx.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,entry_type,amount_paise_signed,reverses_entry_id,posted_at,source,actor_id,simulated) VALUES('revbad','m1','ramesh','REVERSAL',-40000,?,'2026-10-27T00:00:00Z','MANUAL','demo',1)",(eid,))

    def test_reversal_wrong_customer_rejected_by_trigger(self):
        eid=self.post('CREDIT_GIVEN',50000,'a')
        with self.assertRaises(sqlite3.IntegrityError):
            self.cx.execute("INSERT INTO ledger_entries(id,merchant_id,customer_id,entry_type,amount_paise_signed,reverses_entry_id,posted_at,source,actor_id,simulated) VALUES('revbad','m1','priya','REVERSAL',-50000,?,'2026-10-27T00:00:00Z','MANUAL','demo',1)",(eid,))

    def test_two_merchants_cannot_share_customer_via_draft(self):
        with self.assertRaises(sqlite3.IntegrityError):
            create_draft(self.cx,self.ctx,'foreign','CREDIT_GIVEN',200,token='a')

    def test_no_auto_merge_customer_name(self):
        self.cx.execute("INSERT INTO customers(id,merchant_id,display_name,normalized_name,created_at) VALUES('r2','m1','Ramesh','ramesh','2026-10-27T00:00:00Z')")
        self.assertEqual(self.cx.execute("SELECT COUNT(*) FROM customers WHERE merchant_id='m1' AND normalized_name='ramesh'").fetchone()[0],2)

    def test_timezone_boundary(self):
        self.assertEqual(ist_business_day_bounds('2026-10-27'),('2026-10-26T18:30:00Z','2026-10-27T18:30:00Z'))
        self.cx.execute("INSERT INTO sales_events(id,merchant_id,amount_paise,observed_at,source,simulated) VALUES('sale','m1',910000,'2026-10-26T19:00:00Z','FIXTURE',1)")
        self.assertEqual(observed_sales_for_business_day(self.cx,'m1','2026-10-27'),('SUFFICIENT',910000))
        self.assertEqual(observed_sales_for_business_day(self.cx,'m1','2026-10-26'),('INSUFFICIENT_DATA',None))

    def test_no_sales_not_automatically_zero(self):
        self.post('CREDIT_GIVEN',50000,'a')
        self.assertEqual(observed_sales_for_business_day(self.cx,'m1','2026-10-27'),('INSUFFICIENT_DATA',None))

    def test_foreign_keys_integrity(self):
        self.assertEqual(self.cx.execute('PRAGMA foreign_key_check').fetchall(),[])

if __name__=='__main__':unittest.main()
