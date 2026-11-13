import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { request } from 'node:https';

const url = new URL(process.env.VISHWAS_HOSTED_TEST_URL);
const origin = url.origin;
function call(path, { method = 'GET', cookie, payload, headers = {}, status = 200 } = {}) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, origin), {
      method, timeout: 10000,
      headers: { origin, ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
        ...headers },
    }, res => {
      res.setEncoding('utf8');
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          assert.equal(res.statusCode, status, path);
          resolve({ data: res.headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : text,
            cookie: res.headers['set-cookie']?.[0], retryAfter: res.headers['retry-after'] });
        } catch (error) { reject(error); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Hosted HTTPS request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

const homepage = await call('/');
assert.match(homepage.data, /<div id="root">/);
const asset = /(?:src|href)="(\/assets\/[^"]+)"/.exec(homepage.data)?.[1];
assert.ok(asset);
await call(asset);
assert.equal((await call('/v1/health/ready')).data.status, 'ready');
await call('/v1/demo/session', { method: 'POST', headers: { origin: 'https://example.invalid' }, status: 403 });
await call('/v1/demo/session', { method: 'POST', payload: { value: 'x'.repeat(8192) }, status: 413 });
const sessions = await Promise.all([1, 2].map(() => call('/v1/demo/session', { method: 'POST', status: 201 })));
assert.notEqual(sessions[0].data.merchant_id, sessions[1].data.merchant_id);
for (const session of sessions) assert.match(session.cookie, /; Secure; HttpOnly; SameSite=Strict/);
const [first, second] = sessions.map(session => session.cookie.split(';')[0]);
const customers = (await call('/v1/customers', { cookie: first })).data;
const cid = customers.find(row => row.display_name === 'Ramesh').id;
await call('/v1/customers/' + cid + '/balance', { cookie: second, status: 404 });
const draft = (await call('/v1/ledger/drafts', { method: 'POST', cookie: first,
  headers: { 'client-operation-id': randomUUID() }, payload: { transcript: '', language: 'en-IN',
    parsed_override: { customer_id: cid, entry_type: 'CREDIT_GIVEN', amount_paise: 50000, currency: 'INR' } } })).data;
const key = randomUUID();
const confirm = () => call('/v1/ledger/drafts/' + draft.draft_id + '/confirm', { method: 'POST', cookie: first,
  headers: { 'idempotency-key': key }, payload: { confirm: true, expected_version: draft.version } });
const [a,b] = await Promise.all([confirm(), confirm()]);
assert.deepEqual(a.data,b.data);
assert.equal(a.data.outstanding_balance_paise,50000);
assert.deepEqual((await call('/v1/ledger/entries', { cookie: second })).data.items, []);
const assistantPath = '/v1/assistant/questions';
await Promise.all(Array.from({ length: 20 }, () =>
  call(assistantPath, { method: 'POST', cookie: second, payload: { question: '' }, status: 422 })));
const limited = await call(assistantPath, { method: 'POST', cookie: second, payload: { question: '' }, status: 429 });
assert.equal(limited.data.error.code, 'RATE_LIMITED');
assert.equal(limited.retryAfter, '60');
await call('/v1/demo/session', { method: 'DELETE', cookie: first });
await call('/v1/merchants/me', { cookie: first, status: 401 });
if (process.argv.includes('--expire-disposable-session')) {
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Expiry witness is loopback only');
  const migration = new URL(process.env.HOSTED_MIGRATION_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(migration.hostname));
  assert.equal(migration.pathname, '/hyd_restored');
  const { openDatabase } = await import('../src/database.mjs');
  const db = openDatabase(migration.href, process.env.HOSTED_DATABASE_CA, { migration: true });
  try {
    const token = second.slice(second.indexOf('=') + 1);
    const hash = createHmac('sha256', process.env.HOSTED_SESSION_SECRET).update('session:' + token).digest('hex');
    await db.transact(async connection => {
      const result = await connection.query(`UPDATE hyd_demo.demo_sessions
        SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1`, [hash]);
      assert.equal(result.rowCount, 1);
    });
    const expired = await call('/v1/merchants/me', { cookie: second, status: 401 });
    assert.equal(expired.data.error.code, 'SESSION_EXPIRED');
    console.log('Expired PostgreSQL session rejected through HTTPS.');
  } finally {
    await db.pool.end();
  }
} else {
  await call('/v1/demo/session', { method: 'DELETE', cookie: second });
  await call('/v1/merchants/me', { cookie: second, status: 401 });
}
console.log('HTTPS assets, readiness, origin, input bounds, isolation, concurrent receipt replay, request limits and revocation passed.');
