import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.mjs';

test('provisioned app schemas accept migration replay without database CREATE grants', async () => {
  const db = new PGlite();
  try {
    const sql = await readFile(new URL('../deployment/supabase-provision.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec('SET SESSION AUTHORIZATION hyd_owner');
    const { rows: [owner] } = await db.query("SELECT has_database_privilege(current_user, 'postgres', 'CREATE') AS can_create");
    assert.equal(owner.can_create, false);
    const migration = {
      target: { supabase: true, role: 'hyd_owner' },
      transact: action => db.transaction(tx => action({
        query: (sql, values) => !values && sql.includes(';') ? tx.exec(sql) : tx.query(sql, values),
      })),
    };
    await migrate(migration);
    await migrate({ ...migration, target: { supabase: false, role: 'hyd_owner' } });
    const directory = new URL('../migrations/', import.meta.url);
    const expected = await Promise.all((await readdir(directory)).sort().map(async name => ({
      name, sha256: createHash('sha256').update(await readFile(new URL(name, directory))).digest('hex'),
    })));
    assert.deepEqual((await db.query('SELECT name, sha256 FROM hyd_demo_release.migrations ORDER BY name')).rows, expected);
    await db.query("UPDATE hyd_demo_release.migrations SET sha256 = repeat('0', 64) WHERE name = $1", [expected[0].name]);
    await assert.rejects(migrate(migration), /APPLIED_MIGRATION_CHANGED/);
    await db.exec('RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION hyd_runtime');
    const { rows: [runtime] } = await db.query(`SELECT current_user AS role,
      has_table_privilege(current_user, 'hyd_demo.journal', 'INSERT') AS can_post,
      has_schema_privilege(current_user, 'hyd_demo_release', 'USAGE') AS can_read_migrations,
      (SELECT count(*)::int FROM hyd_demo.customers) AS unbound_customers`);
    assert.deepEqual(runtime, { role: 'hyd_runtime', can_post: false, can_read_migrations: false, unbound_customers: 0 });
  } finally {
    await db.close();
  }
});
