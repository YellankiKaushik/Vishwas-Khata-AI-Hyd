import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { openDatabase } from '../src/database.mjs';

const database = openDatabase(process.env.HOSTED_DATABASE_URL, process.env.HOSTED_DATABASE_CA);
const { pool, transact } = database;
const hash = () => randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
const query = async (db, sql, params) => (await db.query(sql, params)).rows[0]?.value;
const open = token => transact(db => query(db, 'SELECT hyd_demo.open_demo_session($1) AS value', [token]));
const bind = (db, token) => query(db, 'SELECT hyd_demo.bind_demo_session($1) AS value', [token]);

after(() => pool.end());

test('managed PostgreSQL private role, independent connections, concurrent replay and rollback', async () => {
  const a = hash();
  const b = hash();
  const tenantA = await open(a);
  const tenantB = await open(b);
  try {
    const [one, two] = await Promise.all([pool.connect(), pool.connect()]);
    try {
      const pid = client => query(client, 'SELECT pg_backend_pid() AS value');
      assert.notEqual(await pid(one), await pid(two));
    } finally {
      one.release();
      two.release();
    }

    const owner = await transact(db => query(db, `SELECT r.rolname AS value
      FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner
      WHERE n.nspname='hyd_demo' AND NOT r.rolsuper AND NOT r.rolbypassrls AND r.rolname <> current_user`));
    assert.ok(owner, 'A separate non-superuser owns the schema');
    const customer = await transact(async db => {
      assert.equal(await bind(db, a), tenantA);
      assert.equal(await query(db, 'SELECT current_user AS value'), 'hyd_runtime');
      assert.equal(await query(db, "SELECT rolsuper OR rolbypassrls AS value FROM pg_roles WHERE rolname=current_user"), false);
      return query(db, 'SELECT customer_id AS value FROM hyd_demo.customers LIMIT 1');
    });
    await transact(async db => {
      assert.equal(await bind(db, b), tenantB);
      await db.query("SELECT set_config('hyd_demo.tenant_id',$1,true)", [tenantA]);
      assert.equal(await query(db, 'SELECT count(*)::integer AS value FROM hyd_demo.customers'), 0);
    });
    await assert.rejects(transact(async db => {
      await bind(db, a);
      await db.query("SELECT hyd_demo.post_entry($1,$2,'CREDIT_GIVEN',50000,true)", [customer, randomUUID()]);
    }), { code: '42501' });

    const draft = await transact(async db => {
      await bind(db, a);
      return query(db, "SELECT hyd_demo.save_financial_draft(NULL,$1,NULL,$2,'CREDIT_GIVEN',50000,NULL) AS value",
        [randomUUID(), customer]);
    });
    const key = randomUUID();
    const confirm = (db, operation) => query(db,
      'SELECT hyd_demo.confirm_financial_draft($1,$2,1,true) AS value', [draft.draft_id, operation]);
    const review = (db, version, approved) => query(db,
      'SELECT hyd_demo.confirm_financial_draft($1,$2,$3,$4) AS value',
      [draft.draft_id, key, version, approved]);
    for (const [version, approved, error] of [[2, true, /VERSION_CONFLICT/],
      [1, false, /EXPLICIT_REVIEW_REQUIRED/]]) {
      await assert.rejects(transact(async db => {
        await bind(db, a);
        return review(db, version, approved);
      }), error);
    }
    await assert.rejects(transact(async db => {
      await bind(db, a);
      await confirm(db, key);
      throw Error('synthetic rollback witness');
    }), /synthetic rollback witness/);
    assert.equal(await transact(async db => {
      await bind(db, a);
      return query(db, 'SELECT count(*)::integer AS value FROM hyd_demo.journal');
    }), 0);

    const attempts = await Promise.all([key,key].map(operation => transact(async db => {
      await bind(db, a);
      return confirm(db, operation);
    })));
    assert.deepEqual(attempts[0], attempts[1]);
    assert.equal(attempts[0].balance_after_paise, 50000);
    assert.equal(await transact(async db => {
      await bind(db, a);
      return query(db, 'SELECT count(*)::integer AS value FROM hyd_demo.journal');
    }), 1);
    assert.equal(await transact(async db => {
      await bind(db, a);
      return query(db, 'SELECT count(*)::integer AS value FROM hyd_demo.confirmation_receipts');
    }), 1);
    await assert.rejects(transact(async db => {
      await bind(db, b);
      await confirm(db, randomUUID());
    }), /DRAFT_NOT_FOUND/);
    const commitment = randomUUID();
    const ledger = db => query(db, 'SELECT hyd_demo.ledger_evidence($1) AS value', [customer]);
    const createCommitment = db => query(db, `SELECT hyd_demo.reviewed_commitment_change(
      $1,$2,$3,'CREATE',0,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,
      50000,$4,'Synthetic review') AS value`, [customer, commitment, randomUUID(), null]);
    await assert.rejects(transact(async db => {
      await bind(db, a);
      await createCommitment(db);
    }), /STALE_LEDGER/);
    const reviewed = await transact(async db => {
      await bind(db, a);
      const evidence = await ledger(db);
      return query(db, `SELECT hyd_demo.reviewed_commitment_change(
        $1,$2,$3,'CREATE',0,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,
        50000,$4,'Synthetic review') AS value`, [customer, commitment, randomUUID(), evidence.ledger_hash]);
    });
    assert.equal(reviewed.due_status, 'DUE_TODAY');
    const followup = db => query(db, 'SELECT hyd_demo.review_followup($1,1,$2,true) AS value',
      [commitment, reviewed.evidence_hash]);
    assert.equal((await transact(async db => {
      await bind(db, a);
      return followup(db);
    })).sent, false);
    await transact(async db => {
      await bind(db, a);
      const payment = await query(db, `SELECT hyd_demo.save_financial_draft(
        NULL,$1,NULL,$2,'REPAYMENT_RECEIVED',20000,NULL) AS value`, [randomUUID(), customer]);
      return query(db, 'SELECT hyd_demo.confirm_financial_draft($1,$2,1,true) AS value',
        [payment.draft_id, randomUUID()]);
    });
    await assert.rejects(transact(async db => {
      await bind(db, a);
      return followup(db);
    }), /STALE_EVIDENCE/);
    await assert.rejects(transact(async db => {
      await bind(db, b);
      return followup(db);
    }), /COMMITMENT_NOT_FOUND/);
    const update = reason => transact(async db => {
      await bind(db, a);
      const evidence = await ledger(db);
      return query(db, `SELECT hyd_demo.reviewed_commitment_change(
        $1,$2,$3,'UPDATE',1,(statement_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,
        30000,$4,$5) AS value`, [customer, commitment, randomUUID(), evidence.ledger_hash, reason]);
    });
    const edits = await Promise.allSettled([update('First concurrent edit'), update('Second concurrent edit')]);
    const winners = edits.filter(result => result.status === 'fulfilled');
    const losers = edits.filter(result => result.status === 'rejected');
    assert.equal(winners.length, 1);
    assert.equal(winners[0].value.version, 2);
    assert.equal(losers.length, 1);
    assert.match(losers[0].reason.message, /VERSION_CONFLICT/);
    const events = await transact(async db => {
      await bind(db, a);
      return (await db.query(`SELECT version, event_type FROM hyd_demo.commitment_events
        WHERE commitment_id=$1 ORDER BY version`, [commitment])).rows;
    });
    assert.deepEqual(events, [{ version: 1, event_type: 'CREATED' }, { version: 2, event_type: 'UPDATED' }]);

    const wrongCustomer = await transact(async db => {
      await bind(db, a);
      return query(db, 'SELECT customer_id AS value FROM hyd_demo.customers WHERE customer_id<>$1 LIMIT 1', [customer]);
    });
    await assert.rejects(transact(async db => {
      await bind(db, a);
      const evidence = await query(db, 'SELECT hyd_demo.ledger_evidence($1) AS value', [wrongCustomer]);
      return query(db, `SELECT hyd_demo.reviewed_commitment_change(
        $1,$2,$3,'CANCEL',2,NULL,NULL,$4,'Wrong customer') AS value`,
        [wrongCustomer, commitment, randomUUID(), evidence.ledger_hash]);
    }), /COMMITMENT_NOT_FOUND/);
    await transact(db => query(db, 'SELECT hyd_demo.revoke_demo_session($1) AS value', [b]));
    assert.equal(await transact(db => bind(db, b)), null);

    const expires = hash();
    await open(expires);
    const migration = process.env.HOSTED_MIGRATION_DATABASE_URL;
    assert.ok(migration, 'Use a disposable database with its separate migration role for the expiry witness');
    const maintenance = openDatabase(migration, process.env.HOSTED_DATABASE_CA, { migration: true });
    try {
      await maintenance.transact(db => db.query(`UPDATE hyd_demo.demo_sessions
        SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1`, [expires]));
      assert.equal(await transact(db => bind(db, expires)), null);
    } finally {
      await maintenance.pool.end();
    }
  } finally {
    await Promise.all([a,b].map(token => transact(db => query(db, 'SELECT hyd_demo.revoke_demo_session($1) AS value', [token]))));
  }
});
