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
const makeDraft = async (entryType, amount) => (await call('/v1/ledger/drafts', {
  method: 'POST', cookie: first, headers: { 'client-operation-id': randomUUID() },
  payload: { transcript: '', language: 'en-IN',
    parsed_override: { customer_id: cid, entry_type: entryType, amount_paise: amount, currency: 'INR' } },
})).data;
const confirm = (draft, key, status = 200) => call('/v1/ledger/drafts/' + draft.draft_id + '/confirm', {
  method: 'POST', cookie: first, status, headers: { 'idempotency-key': key },
  payload: { confirm: true, expected_version: draft.version },
});
const credit = await makeDraft('CREDIT_GIVEN', 50000);
const key = randomUUID();
const [a,b] = await Promise.all([confirm(credit, key), confirm(credit, key)]);
assert.deepEqual(a.data,b.data);
assert.equal(a.data.outstanding_balance_paise,50000);
const repayment = await makeDraft('REPAYMENT_RECEIVED', 20000);
assert.equal((await confirm(repayment, key, 409)).data.error.code, 'IDEMPOTENCY_CONFLICT');
assert.equal((await confirm(repayment, randomUUID())).data.outstanding_balance_paise, 30000);
assert.deepEqual((await confirm(credit, key)).data, a.data);

const balancePath = '/v1/customers/' + cid + '/balance?include_review_token=true';
const duePath = '/v1/followups/due';
const balance = (await call(balancePath, { cookie: first })).data;
const due = (await call(duePath, { cookie: first })).data;
const commitment = (await call('/v1/commitments', {
  method: 'POST', cookie: first, headers: { 'client-operation-id': randomUUID() },
  payload: { customer_id: cid, expected_date: due.as_of_date_ist, promised_amount_paise: 30000,
    reviewed_ledger_hash: balance.ledger_hash, reason: 'Synthetic HTTPS acceptance' },
})).data;
const answer = (await call('/v1/assistant/questions', {
  method: 'POST', cookie: first, payload: { question: 'How much does Ramesh owe?',
    customer_id: cid, language: 'en-IN', request_id: randomUUID() },
})).data;
assert.equal(answer.items[0].outstanding_paise, 30000);
const draftOptions = { method: 'POST', cookie: first,
  payload: { commitment_id: commitment.id, expected_version: commitment.version,
    language: 'en-IN', tone: 'POLITE', facts_hash: commitment.evidence_hash, confirm_review: true } };
const draft = (await call('/v1/followups/drafts', draftOptions)).data;
assert.equal(draft.status, 'DRAFT_NOT_SENT');
assert.equal(draft.sent, false);
const laterRepayment = await makeDraft('REPAYMENT_RECEIVED', 10000);
assert.equal((await confirm(laterRepayment, randomUUID())).data.outstanding_balance_paise, 20000);
assert.equal((await call('/v1/followups/drafts', { ...draftOptions, status: 409 })).data.error.code, 'STALE_EVIDENCE');
const laterCredit = await makeDraft('CREDIT_GIVEN', 50000);
assert.equal((await confirm(laterCredit, randomUUID())).data.outstanding_balance_paise, 70000);
assert.equal((await call('/v1/commitments/' + commitment.id, { cookie: first })).data.due_status, 'REVIEW_REQUIRED');
assert.equal((await call('/v1/ledger/entries', { cookie: first })).data.items.length, 4);
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
console.log('HTTPS assets, readiness, origin, input bounds, isolation, concurrent receipt replay, financial journey, stale evidence, request limits and revocation passed.');
