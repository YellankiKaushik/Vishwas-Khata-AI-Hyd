import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { openDatabase } from '../src/database.mjs';

const { pool, transact } = openDatabase(process.env.HOSTED_MIGRATION_DATABASE_URL, process.env.HOSTED_DATABASE_CA, { migration: true });
const directory = new URL('../migrations/', import.meta.url);
try {
  await transact(async db => {
    const owner = (await db.query(`SELECT current_user AS name, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    if (owner.name === 'hyd_runtime' || owner.rolsuper || owner.rolbypassrls)
      throw new Error('USE_DEDICATED_MIGRATION_ROLE');
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended('hyd_demo.migrations', 0))");
    await db.query('CREATE SCHEMA IF NOT EXISTS hyd_demo_release');
    await db.query('REVOKE ALL ON SCHEMA hyd_demo_release FROM PUBLIC');
    await db.query(`CREATE TABLE IF NOT EXISTS hyd_demo_release.migrations
      (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
    const files = (await readdir(directory)).sort();
    const applied = new Map((await db.query('SELECT name, sha256 FROM hyd_demo_release.migrations')).rows
      .map(row => [row.name, row.sha256]));
    if (files.slice(0, applied.size).some(name => !applied.has(name)) || applied.size > files.length ||
        (applied.size === 0 && (await db.query("SELECT to_regnamespace('hyd_demo') AS schema")).rows[0].schema))
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
      await db.query(source.replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, ''));
      await db.query('INSERT INTO hyd_demo_release.migrations(name,sha256) VALUES ($1,$2)', [name, sha]);
    }
    await db.query(await readFile(new URL('../deployment/privileges.sql', import.meta.url), 'utf8'));
  });
  console.log(JSON.stringify({ event: 'hosted_schema_migrated' }));
} catch {
  console.error(JSON.stringify({ event: 'hosted_migration_failed' }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
