import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = await readFile(new URL('../migrations/001_synthetic_journal.sql', import.meta.url), 'utf8');
const tenant = '00000000-0000-4000-8000-000000000001';
const otherTenant = '00000000-0000-4000-8000-000000000002';
const customer = '00000000-0000-4000-8000-000000000010';
const otherCustomer = '00000000-0000-4000-8000-000000000011';
const operation = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

before(async () => {
  await db.exec('CREATE ROLE hyd_owner NOLOGIN; CREATE ROLE hyd_api NOLOGIN;');
  await db.exec('GRANT CREATE ON DATABASE postgres TO hyd_owner');
  await db.exec('SET ROLE hyd_owner');
  await db.exec(migration);
  for (const [id, cid] of [[tenant, customer], [otherTenant, otherCustomer]]) {
    await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('hyd_demo.tenant_id', $1, true)", [id]);
      await tx.query("INSERT INTO hyd_demo.customers VALUES ($1, $2, 'Ramesh')", [id, cid]);
    });
  }
  await db.exec('GRANT USAGE ON SCHEMA hyd_demo TO hyd_api');
  await db.exec('GRANT SELECT ON hyd_demo.customers, hyd_demo.journal TO hyd_api');
  await db.exec('GRANT EXECUTE ON FUNCTION hyd_demo.post_entry(uuid, uuid, text, integer, boolean, uuid) TO hyd_api');
  await db.exec('RESET ROLE');
});
after(() => db.close());

async function asApi(id, action, isolation) {
  return db.transaction(async (tx) => {
    if (isolation) await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await tx.exec('SET LOCAL ROLE hyd_api');
    if (id) await tx.query("SELECT set_config('hyd_demo.tenant_id', $1, true)", [id]);
    return action(tx);
  });
}

async function post(tx, { cid = customer, id, kind = 'CREDIT_GIVEN', amount, confirm = true, reverses = null }) {
  const result = await tx.query(
    'SELECT * FROM hyd_demo.post_entry($1, $2, $3, $4, $5, $6)',
    [cid, operation(id), kind, amount, confirm, reverses],
  );
  return result.rows[0];
}

test('signed integer journal reproduces the four balances and original retry receipt', async () => {
  const write = (id, amount, kind) => asApi(tenant, (tx) => post(tx, { id, amount, kind }));
  const credit = await write(101, 50000);
  const balances = [
    credit.balance_after_paise,
    (await write(102, 20000, 'REPAYMENT_RECEIVED')).balance_after_paise,
    (await write(103, 10000, 'REPAYMENT_RECEIVED')).balance_after_paise,
    (await write(104, 50000)).balance_after_paise,
  ].map(Number);
  assert.deepEqual(balances, [50000, 30000, 20000, 70000]);
  assert.deepEqual(await write(101, 50000), credit);
  await assert.rejects(write(101, 50001), /IDEMPOTENCY_CONFLICT/);
});

test('scope is transaction-local and hides rows and customer identifiers across tenants', async () => {
  await asApi(null, async (tx) => {
    assert.deepEqual((await tx.query('SELECT * FROM hyd_demo.customers')).rows, []);
    assert.deepEqual((await tx.query('SELECT * FROM hyd_demo.journal')).rows, []);
  });
  await assert.rejects(asApi(null, (tx) => post(tx, { id: 201, amount: 100 })), /TENANT_REQUIRED/);
  await asApi(otherTenant, async (tx) => {
    assert.deepEqual((await tx.query('SELECT customer_id FROM hyd_demo.customers')).rows, [{ customer_id: otherCustomer }]);
    assert.deepEqual((await tx.query('SELECT * FROM hyd_demo.journal')).rows, []);
    await post(tx, { cid: otherCustomer, id: 101, amount: 100 });
  });
  await assert.rejects(asApi(otherTenant, (tx) => post(tx, { id: 202, amount: 100 })), /CUSTOMER_NOT_FOUND/);
});

test('confirmation, amount, isolation level, and negative receivables are enforced', async () => {
  for (const input of [{ amount: 100, confirm: false }, { amount: 0 }, { amount: null }, { amount: 100000001 }]) {
    await assert.rejects(asApi(tenant, (tx) => post(tx, { id: 301, ...input })), /INVALID_CONFIRMED_ENTRY/);
  }
  await assert.rejects(asApi(tenant, (tx) => post(tx, { id: 301, amount: 100 }), true), /READ_COMMITTED_REQUIRED/);
  await assert.rejects(
    asApi(tenant, (tx) => post(tx, { id: 301, amount: 70001, kind: 'REPAYMENT_RECEIVED' })),
    /NEGATIVE_RECEIVABLE/,
  );
});

test('a reversal is an immutable compensating entry and cannot be repeated under a new key', async () => {
  const credit = await asApi(tenant, (tx) => post(tx, { id: 401, amount: 900 }));
  const write = (id) => asApi(tenant, (tx) => post(tx, { id, kind: 'REVERSAL', reverses: credit.entry_id }));
  const reversal = await write(402);
  assert.equal(Number(reversal.signed_paise), -900);
  assert.equal(Number(reversal.balance_after_paise), 70000);
  assert.deepEqual(await write(402), reversal);
  await assert.rejects(write(403), /ENTRY_ALREADY_REVERSED/);
  await assert.rejects(
    asApi(otherTenant, (tx) => post(tx, { cid: otherCustomer, id: 404, kind: 'REVERSAL', reverses: credit.entry_id })),
    /REVERSIBLE_ENTRY_NOT_FOUND/,
  );
  for (const command of ['UPDATE hyd_demo.journal SET signed_paise = 1', 'DELETE FROM hyd_demo.journal', 'TRUNCATE hyd_demo.journal']) {
    await assert.rejects(db.transaction(async (tx) => {
      await tx.exec('SET LOCAL ROLE hyd_owner');
      await tx.exec(command);
    }), /JOURNAL_APPEND_ONLY/);
  }
  await assert.rejects(asApi(tenant, (tx) => tx.exec('INSERT INTO hyd_demo.journal DEFAULT VALUES')), /permission denied/);
});

test('a rolled-back post leaves no receipt or signed balance change', async () => {
  await assert.rejects(asApi(tenant, async (tx) => {
    await post(tx, { id: 501, amount: 1000 });
    throw new Error('abort transaction');
  }), /abort transaction/);
  const receipt = await asApi(tenant, (tx) => post(tx, { id: 501, amount: 25 }));
  assert.equal(Number(receipt.balance_after_paise), 70025);
});
