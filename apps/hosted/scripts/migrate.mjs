import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { openDatabase } from '../src/database.mjs';

const directory = new URL('../migrations/', import.meta.url);
export async function migrate({ target, transact }) {
  await transact(async db => {
    const { rows: [owner] } = await db.query(`SELECT current_user AS name, session_user = current_user AS login,
      rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication FROM pg_roles WHERE rolname=current_user`);
    if (!owner?.login || owner.name !== target.role || owner.name === 'hyd_runtime' ||
        owner.rolsuper || owner.rolbypassrls || owner.rolcreaterole || owner.rolcreatedb || owner.rolreplication)
      throw new Error('USE_DEDICATED_MIGRATION_ROLE');
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('hyd_demo.migrations', 0))");
    const { rows: [schemas] } = await db.query(`SELECT count(*)::int AS owned,
      count(*) FILTER (WHERE nspname = 'hyd_demo_release')::int AS release_owned FROM pg_namespace
      WHERE nspname IN ('hyd_demo', 'hyd_demo_release') AND nspowner = current_user::regrole`);
    if (target.supabase && schemas.owned !== 2) throw new Error('SUPABASE_PROVISIONING_REQUIRED');
    if (!schemas.release_owned) await db.query('CREATE SCHEMA hyd_demo_release');
    await db.query('REVOKE ALL ON SCHEMA hyd_demo_release FROM PUBLIC');
    await db.query(`CREATE TABLE IF NOT EXISTS hyd_demo_release.migrations
      (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    const files = (await readdir(directory)).sort();
    const applied = new Map((await db.query('SELECT name, sha256 FROM hyd_demo_release.migrations')).rows
      .map(row => [row.name, row.sha256]));
    const { rows: [schema] } = await db.query(`SELECT n.oid,
      EXISTS (SELECT FROM pg_depend d WHERE d.refclassid = 'pg_namespace'::regclass
        AND d.refobjid = n.oid) AS populated FROM pg_namespace n WHERE n.nspname = 'hyd_demo'`);
    const bootstrap = schemas.owned === 2 && applied.size === 0 && schema && !schema.populated;
    if (files.slice(0, applied.size).some(name => !applied.has(name)) || applied.size > files.length ||
        (applied.size === 0 && schema && !bootstrap))
      throw new Error('SCHEMA_PROVENANCE_REVIEW_REQUIRED');
    for (const name of files) {
      if (!/^\d{3}_[a-z_]+\.sql$/.test(name)) throw new Error('INVALID_MIGRATION_FILENAME');
      const source = await readFile(new URL(name, directory), 'utf8');
      const sha = createHash('sha256').update(source).digest('hex');
      if (applied.has(name)) {
        if (applied.get(name) !== sha) throw new Error('APPLIED_MIGRATION_CHANGED');
        continue;
      }
      if (!/^BEGIN;$/m.test(source) || !/COMMIT;\s*$/.test(source)) throw new Error('MIGRATION_TRANSACTION_REQUIRED');
      let sql = source.replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, '');
      if (bootstrap && name === '001_synthetic_journal.sql') {
        if (!/^CREATE SCHEMA hyd_demo;$/m.test(sql)) throw new Error('INVALID_SUPABASE_BOOTSTRAP');
        sql = sql.replace(/^CREATE SCHEMA hyd_demo;$/m, '');
      }
      await db.query(sql);
      await db.query('INSERT INTO hyd_demo_release.migrations(name,sha256) VALUES ($1,$2)', [name, sha]);
    }
    await db.query(await readFile(new URL('../deployment/privileges.sql', import.meta.url), 'utf8'));
  });
}

if (import.meta.main) {
  let database;
  try {
    database = openDatabase(process.env.HOSTED_MIGRATION_DATABASE_URL, process.env.HOSTED_DATABASE_CA, { migration: true });
    await migrate(database);
    console.log(JSON.stringify({ event: 'hosted_schema_migrated' }));
  } catch {
    console.error(JSON.stringify({ event: 'hosted_migration_failed' }));
    process.exitCode = 1;
  } finally {
    await database?.pool.end();
  }
}
