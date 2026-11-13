import pg from 'pg';

export function openDatabase(connectionString, ca) {
  if (!connectionString || !ca) throw new Error('HOSTED_DATABASE_CONFIGURATION_REQUIRED');
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username ||
      [...url.searchParams.keys()].some(key => key !== 'application_name')) {
    throw new Error('HOSTED_DATABASE_CONFIGURATION_INVALID');
  }
  const pool = new pg.Pool({ connectionString, ssl: { ca, rejectUnauthorized: true },
    max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  pool.on('error', () => console.error(JSON.stringify({ event: 'hosted_database_idle_error' })));
  return {
    pool,
    async transact(action) {
      const connection = await pool.connect();
      let discard = false;
      try {
        await connection.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await connection.query("SET LOCAL statement_timeout = '5s'");
        await connection.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
        await connection.query("SET LOCAL TIME ZONE 'UTC'");
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
