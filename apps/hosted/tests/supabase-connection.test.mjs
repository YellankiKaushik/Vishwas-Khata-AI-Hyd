import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseTarget, openDatabase } from '../src/database.mjs';

const project = 'xzsccwmljyckbmjcfang';
const host = 'aws-0-ap-south-1.pooler.supabase.com';
const pooled = `postgresql://hyd_runtime.${project}:test%40password@${host}:6543/postgres`;
const owner = `postgresql://hyd_owner.${project}:test%40password@${host}:5432/postgres`;

test('Supabase shared usernames select a project and preserve the effective role', async () => {
  assert.deepEqual(databaseTarget(pooled), {
    role: 'hyd_runtime', project, supabase: true, transactionPooler: true,
  });
  assert.deepEqual(databaseTarget(owner, { migration: true }), {
    role: 'hyd_owner', project, supabase: true, transactionPooler: false,
  });
  assert.equal(databaseTarget(`postgres://hyd_owner:fixture@db.${project}.supabase.co:5432/postgres`,
    { migration: true }).role, 'hyd_owner');
  assert.equal(databaseTarget('postgres://hyd_runtime:fixture@127.0.0.1:5432/hyd_acceptance').supabase, false);
  const { pool } = openDatabase(pooled, 'fixture CA', { maxConnections: 8 });
  try {
    assert.equal(pool.options.connectionString, pooled);
    assert.deepEqual(pool.options.ssl, { ca: 'fixture CA', rejectUnauthorized: true });
    assert.equal(pool.options.max, 2);
  } finally {
    await pool.end();
  }
});

test('Supabase validation rejects wrong roles, endpoints, ports and TLS overrides', () => {
  for (const invalid of [
    pooled.replace(host, host + '.example.invalid'),
    pooled.replace(project, 'too-short'),
    pooled.replace('hyd_runtime', 'postgres'),
    pooled.replace('hyd_runtime', 'hyd_owner'),
    pooled.replace('6543', '6432'),
    pooled.replace('/postgres', '/other'),
    pooled.replace('test%40password', ''),
    pooled.replace('test%40password', '%ZZ'),
    pooled + '?sslmode=disable',
    pooled + '?sslrootcert=override',
    pooled + '?options=-c%20role%3Dpostgres',
  ]) assert.throws(() => databaseTarget(invalid), /^Error: HOSTED_/);
  assert.throws(() => databaseTarget(owner.replace('5432', '6543'), { migration: true }),
    /HOSTED_SUPABASE_CONFIGURATION_INVALID/);
  assert.throws(() => databaseTarget(pooled, { migration: true }), /HOSTED_SUPABASE_CONFIGURATION_INVALID/);
});
