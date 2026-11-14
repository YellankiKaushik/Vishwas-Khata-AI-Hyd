import pg from 'pg';

const sharedPooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const directSupabase = /^db\.[a-z0-9]{20}\.supabase\.co$/;

export function databaseTarget(connectionString, { migration = false } = {}) {
  let url, username;
  try {
    url = new URL(connectionString);
    username = decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new Error('HOSTED_DATABASE_CONFIGURATION_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !username ||
      url.hash || [...url.searchParams.keys()].some(key => key !== 'application_name')) {
    throw new Error('HOSTED_DATABASE_CONFIGURATION_INVALID');
  }
  const shared = sharedPooler.test(url.hostname);
  const supabase = shared || directSupabase.test(url.hostname);
  let role = username;
  let project = null;
  if (supabase) {
    const identity = shared ? /^(hyd_owner|hyd_runtime)\.([a-z0-9]{20})$/.exec(username) : null;
    role = shared ? identity?.[1] : username;
    project = shared ? identity?.[2] : url.hostname.split('.')[1];
    if (!project || role !== (migration ? 'hyd_owner' : 'hyd_runtime') ||
        !url.password || url.pathname !== '/postgres' || !['5432', '6543'].includes(url.port) ||
        (migration && url.port !== '5432')) {
      throw new Error('HOSTED_SUPABASE_CONFIGURATION_INVALID');
    }
  } else if (username.includes('.') || (!migration && username !== 'hyd_runtime')) {
    throw new Error('HOSTED_RUNTIME_ROLE_REQUIRED');
  }
  return { role, project, supabase, transactionPooler: supabase && url.port === '6543' };
}

export function openDatabase(connectionString, ca, {
  migration = false, maxConnections = 5, idleTimeoutMillis = 10000,
} = {}) {
  if (!connectionString || !ca) throw new Error('HOSTED_DATABASE_CONFIGURATION_REQUIRED');
  const target = databaseTarget(connectionString, { migration });
  const pool = new pg.Pool({ connectionString, ssl: { ca, rejectUnauthorized: true },
    max: target.supabase ? Math.min(maxConnections, 2) : maxConnections,
    connectionTimeoutMillis: 5000, idleTimeoutMillis });
  pool.on('error', () => console.error(JSON.stringify({ event: 'hosted_database_idle_error' })));
  return {
    pool,
    target,
    async transact(action) {
      const connection = await pool.connect();
      let discard = false;
      try {
        await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await connection.query("SET LOCAL statement_timeout = '5s'");
        await connection.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
        await connection.query("SET LOCAL TIME ZONE 'UTC'");
        if (!migration) {
          const { rows: [role] } = await connection.query(`SELECT current_user = 'hyd_runtime'
            AND session_user = current_user AND NOT rolsuper
            AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication
            AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
            AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('hyd_demo', 'hyd_demo_release') AND nspowner = r.oid)
            AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname IN ('hyd_demo', 'hyd_demo_release') AND c.relowner = r.oid)
            AND (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'hyd_demo' AND c.relrowsecurity AND c.relforcerowsecurity
                AND c.relname IN ('customers', 'journal', 'commitments', 'commitment_events',
                  'commitment_receipts', 'financial_drafts', 'confirmation_receipts')
                AND NOT has_table_privilege(r.oid, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE')) = 7
            AS valid FROM pg_roles r WHERE rolname = current_user`);
          if (!role?.valid) throw new Error('HOSTED_RUNTIME_ROLE_REQUIRED');
        }
        const result = await action(connection);
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        try { await connection.query('ROLLBACK'); } catch { discard = true; }
        throw error;
      } finally {
        connection.release(discard);
      }
    },
  };
}
