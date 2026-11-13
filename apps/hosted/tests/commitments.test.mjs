import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// An actual embedded PostgreSQL engine, not a SQL string mock. This does not
// simulate multiple network connections or prove managed PostgreSQL deployment.
const db = new PGlite();
const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const tenant = uuid(1), other = uuid(2), customer = uuid(10), otherCustomer = uuid(11);
const commitment = uuid(20);
let today, original, draft;

before(async () => {
  await db.exec('CREATE ROLE hyd_owner NOLOGIN NOBYPASSRLS; CREATE ROLE hyd_api NOLOGIN NOBYPASSRLS;');
  await db.exec('GRANT CREATE ON DATABASE postgres TO hyd_owner; SET ROLE hyd_owner;');
  for (const file of ['001_synthetic_journal.sql', '002_commitment_evidence.sql']) {
    await db.exec(await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  for (const [id, cid] of [[tenant, customer], [other, otherCustomer]]) {
    await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('hyd_demo.tenant_id', $1, true)", [id]);
      await tx.query("INSERT INTO hyd_demo.customers VALUES ($1, $2, 'Ramesh')", [id, cid]);
    });
  }
  await db.exec('GRANT USAGE ON SCHEMA hyd_demo TO hyd_api; GRANT SELECT ON ALL TABLES IN SCHEMA hyd_demo TO hyd_api;');
  for (const signature of [
    'post_entry(uuid,uuid,text,integer,boolean,uuid)',
    'ledger_evidence(uuid)', 'commitment_evidence(uuid)',
    'mutate_commitment(uuid,uuid,uuid,text,integer,date,integer,text,boolean)',
    'review_followup(uuid,integer,text,boolean)',
  ]) await db.exec('GRANT EXECUTE ON FUNCTION hyd_demo.' + signature + ' TO hyd_api');
  await db.exec('RESET ROLE');
  today = (await db.query("SELECT (statement_timestamp() AT TIME ZONE 'Asia/Kolkata')::date::text AS day")).rows[0].day;
});
after(() => db.close());

async function api(id, action) {
  return db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE hyd_api');
    if (id) await tx.query("SELECT set_config('hyd_demo.tenant_id', $1, true)", [id]);
    return action(tx);
  });
}
async function value(tx, sql, params) { return (await tx.query(sql, params)).rows[0].value; }
const evidence = (id = commitment, tid = tenant) => api(tid, (tx) => value(tx, 'SELECT hyd_demo.commitment_evidence($1) AS value', [id]));
const ledger = () => api(tenant, (tx) => value(tx, 'SELECT hyd_demo.ledger_evidence($1) AS value', [customer]));
const post = (operation, amount, kind = 'CREDIT_GIVEN') => api(tenant, (tx) => tx.query(
  'SELECT * FROM hyd_demo.post_entry($1,$2,$3,$4,true,NULL)', [customer, uuid(operation), kind, amount],
));
async function mutate(operation, { id = commitment, cid = customer, action = 'CREATE', version = 0,
  date = today, amount = 30000, hash, confirm = true, tid = tenant } = {}) {
  return api(tid, (tx) => value(tx, 'SELECT hyd_demo.mutate_commitment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
    [cid, id, uuid(operation), action, version, date, amount, hash, confirm]));
}
const followup = (item, confirm = true) => api(tenant, (tx) => value(tx,
  'SELECT hyd_demo.review_followup($1,$2,$3,$4) AS value', [commitment, item.version, item.evidence_hash, confirm]));

test('journal, reviewed expectation, exact original receipt and unsent follow-up form one grounded scenario', async () => {
  await post(100, 50000);
  await post(101, 20000, 'REPAYMENT_RECEIVED');
  const facts = await ledger();
  assert.equal(facts.outstanding_paise, 30000);
  assert.equal(facts.ledger_hash.length, 64);
  original = await mutate(200, { hash: facts.ledger_hash });
  assert.equal(original.due_status, 'DUE_TODAY');
  assert.equal(original.as_of_date_ist, today);
  assert.equal(original.promised_paise, 30000);
  assert.equal(original.evidence_ids.length, 2);
  assert.deepEqual(await mutate(200, { hash: facts.ledger_hash }), original);
  await assert.rejects(mutate(200, { amount: 25000, hash: facts.ledger_hash }), /IDEMPOTENCY_CONFLICT/);
  draft = await followup(original);
  assert.equal(draft.status, 'DRAFT_NOT_SENT');
  assert.equal(draft.sent, false);
  assert.match(draft.text, /INR 300.00/);
  await assert.rejects(followup(original, false), /EXPLICIT_REVIEW_REQUIRED/);
});

test('partial repayment invalidates old preview without reallocating historical promised amount', async () => {
  await post(102, 10000, 'REPAYMENT_RECEIVED');
  await assert.rejects(followup(original), /STALE_EVIDENCE/);
  const current = await evidence();
  assert.equal(current.outstanding_paise, 20000);
  assert.equal(current.promised_paise, 30000);
  assert.equal(current.due_status, 'DUE_TODAY');
  assert.match((await followup(current)).text, /INR 200.00/);
  assert.equal((await api(tenant, (tx) => tx.query('SELECT count(*) AS n FROM hyd_demo.commitment_events'))).rows[0].n, 1);
});

test('new credit requires renewed merchant review, and HANDLED never posts a payment', async () => {
  await post(103, 50000);
  const current = await evidence();
  assert.equal(current.outstanding_paise, 70000);
  assert.equal(current.due_status, 'REVIEW_REQUIRED');
  assert.equal(current.followup_eligible, false);
  await assert.rejects(followup(current), /REVIEW_REQUIRED/);
  const reviewed = await mutate(201, { action: 'UPDATE', version: 1, amount: 70000, hash: current.ledger_hash });
  assert.equal(reviewed.version, 2);
  assert.equal(reviewed.due_status, 'DUE_TODAY');
  await assert.rejects(mutate(202, { action: 'UPDATE', version: 1, hash: current.ledger_hash }), /VERSION_CONFLICT/);
  const closed = await mutate(203, { action: 'HANDLE', version: 2 });
  assert.equal(closed.state, 'HANDLED');
  assert.equal(closed.outstanding_paise, 70000);
  assert.equal((await api(tenant, (tx) => tx.query('SELECT count(*) AS n FROM hyd_demo.journal'))).rows[0].n, 4);
  await assert.rejects(mutate(204, { action: 'HANDLE', version: 3 }), /VERSION_CONFLICT/);
});

test('RLS and composite customer/commitment identity hold for reads, writes and fabricated history', async () => {
  for (const table of ['commitments', 'commitment_events', 'commitment_receipts']) {
    assert.deepEqual((await api(other, (tx) => tx.query('SELECT * FROM hyd_demo.' + table))).rows, []);
    assert.deepEqual((await api(null, (tx) => tx.query('SELECT * FROM hyd_demo.' + table))).rows, []);
  }
  await assert.rejects(evidence(commitment, other), /COMMITMENT_NOT_FOUND/);
  await assert.rejects(evidence(commitment, null), /TENANT_REQUIRED/);
  await assert.rejects(mutate(210, { tid: other, hash: original.ledger_hash }), /CUSTOMER_NOT_FOUND/);
  // The DB owner is constrained by FORCE RLS, too. An unrelated same-tenant
  // customer cannot be attached to this history through a fabricated event.
  await db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE hyd_owner');
    await tx.query("SELECT set_config('hyd_demo.tenant_id', $1, true)", [tenant]);
    await tx.query("INSERT INTO hyd_demo.customers VALUES ($1,$2,'Priya')", [tenant, uuid(12)]);
  });
  for (const [tid, cid] of [[tenant, uuid(12)], [other, otherCustomer]]) {
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE hyd_owner');
      await tx.query("SELECT set_config('hyd_demo.tenant_id', $1, true)", [tid]);
      await tx.query(`INSERT INTO hyd_demo.commitment_events
        (tenant_id,customer_id,commitment_id,version,prior_version,actor_tenant,event_type,snapshot)
        VALUES ($1,$2,$3,4,3,$1,'UPDATED','{}')`, [tid, cid, commitment]);
    }), /foreign key/);
  }
});

test('history and original receipts are immutable, and the API role cannot edit tables', async () => {
  for (const table of ['commitment_events', 'commitment_receipts']) {
    for (const command of ['DELETE FROM ', 'TRUNCATE ']) {
      await assert.rejects(db.transaction(async (tx) => {
        await tx.exec('SET LOCAL ROLE hyd_owner');
        await tx.exec(command + 'hyd_demo.' + table);
      }), /JOURNAL_APPEND_ONLY/);
    }
  }
  await assert.rejects(api(tenant, (tx) => tx.exec("UPDATE hyd_demo.commitments SET state='CANCELLED'")), /permission denied/);
  await assert.rejects(db.transaction(async (tx) => {
    await tx.exec('SET LOCAL ROLE hyd_owner');
    await tx.query("SELECT set_config('hyd_demo.tenant_id',$1,true)", [tenant]);
    await tx.exec('DELETE FROM hyd_demo.commitments');
  }), /COMMITMENT_HISTORY_REQUIRED/);
});

test('invalid/stale reviews and rollback do not leave events or operation receipts', async () => {
  const current = await ledger();
  for (const overrides of [
    { confirm: false }, { amount: 70001 }, { amount: 0 }, { hash: '0'.repeat(64) }, { version: 1 }, { date: '2027-02-29' },
  ]) await assert.rejects(mutate(220, { id: uuid(21), hash: current.ledger_hash, ...overrides }));
  await assert.rejects(api(tenant, async (tx) => {
    await value(tx, 'SELECT hyd_demo.mutate_commitment($1,$2,$3,$4,$5,$6,$7,$8,$9) AS value',
      [customer, uuid(21), uuid(221), 'CREATE', 0, today, 30000, current.ledger_hash, true]);
    throw new Error('simulated transaction abort');
  }), /simulated transaction abort/);
  assert.equal((await api(tenant, (tx) => tx.query('SELECT count(*) AS n FROM hyd_demo.commitment_receipts WHERE operation_id=$1', [uuid(221)]))).rows[0].n, 0);
  assert.equal((await mutate(221, { id: uuid(21), hash: current.ledger_hash })).version, 1);
});
