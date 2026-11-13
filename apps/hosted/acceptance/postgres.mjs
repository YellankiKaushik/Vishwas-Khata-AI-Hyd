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
    await assert.rejects(transact(async db => {
      await bind(db, b);
      await confirm(db, randomUUID());
    }), /DRAFT_NOT_FOUND/);
  } finally {
    await Promise.all([a,b].map(token => transact(db => query(db, 'SELECT hyd_demo.revoke_demo_session($1) AS value', [token]))));
  }
});
