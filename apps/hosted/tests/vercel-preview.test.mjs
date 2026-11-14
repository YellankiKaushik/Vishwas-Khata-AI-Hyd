import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVercelPreview } from '../src/vercel-preview.mjs';

const host = 'candidate.vercel.app';
const origin = 'https://' + host;
const revision = 'a'.repeat(40);
const env = {
  VERCEL: '1', VERCEL_ENV: 'preview', HOSTED_PUBLIC_ORIGIN: origin,
  VERCEL_GIT_COMMIT_SHA: revision, HOSTED_PREVIEW_ACCEPTED_SHA: revision,
  HOSTED_SESSION_SECRET: 'test-only'.repeat(4),
};

function request(path, options = {}) {
  const { headers, ...rest } = options;
  return new Request(origin + path, { ...rest, headers: { host, ...headers } });
}

test('Vercel preview requires the exact accepted revision and refuses production', async () => {
  for (const overrides of [{ HOSTED_PREVIEW_ACCEPTED_SHA: '' }, { VERCEL_ENV: 'production' }, { VERCEL: '' }]) {
    const fetch = createVercelPreview({ env: { ...env, ...overrides },
      connect: () => assert.fail('closed gate must not allocate a database pool') });
    assert.equal((await fetch(request('/v1/health/live'))).status, 200);
    const closed = await fetch(request('/v1/health/ready'));
    assert.equal(closed.status, 503);
    assert.equal((await closed.json()).error.code, 'PREVIEW_GATE_CLOSED');
    assert.equal(closed.headers.get('cache-control'), 'no-store');
  }
});

test('Vercel routes to the shared handler and ignores spoofed origin headers', async () => {
  let connections = 0;
  const fetch = createVercelPreview({ env, connect() {
    connections++;
    return { transact: action => action({ query: async () => ({ rows: [{ value: true }] }) }) };
  } });
  assert.equal((await fetch(request('/v1/health/ready', {
    headers: { host: 'other.invalid', 'x-forwarded-host': host },
  }))).status, 403);
  assert.equal((await fetch(request('/api/merchant?__vishwas_route=health/ready&__vishwas_route=demo/session'))).status, 404);
  assert.equal((await fetch(request('/v1/health/live'))).status, 200);
  assert.equal(connections, 0);
  for (const path of ['/api/merchant?__vishwas_route=health/ready', '/v1/health/ready']) {
    const ready = await fetch(request(path));
    assert.equal(ready.status, 200);
    assert.equal((await ready.json()).status, 'ready');
  }
  const proxy = new Request('http://' + host + '/v1/health/ready', { headers: { host, 'x-forwarded-proto': 'http' } });
  assert.equal((await fetch(proxy)).status, 200);
  assert.equal(connections, 1);
  assert.equal((await fetch(request('/v1/demo/session', { method: 'POST',
    headers: { origin: 'https://other.invalid', 'x-forwarded-host': host },
  }))).status, 403);
  assert.equal((await fetch(request('/api/merchant?__vishwas_route=demo/session', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{',
  }))).status, 400);
  assert.equal((await fetch(request('/v1/demo/session', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: ' '.repeat(8193),
  }))).status, 413);
  assert.equal((await fetch(request('/v1/customers'))).status, 401);
});

const privateText = 'postgresql://hyd_runtime:fake-password@example.invalid/postgres';
const privateError = code => Object.assign(new Error(privateText), {
  code, detail: privateText, cause: new Error(privateText),
});

test('Vercel readiness reports only allowlisted database diagnostics and a matching request ID', async () => {
  const cases = [
    [privateError('28P01'), 'DATABASE_AUTH_FAILURE', '28P01'],
    [privateError('08005'), 'DATABASE_NETWORK_FAILURE', '08005'],
    [privateError('08006'), 'DATABASE_NETWORK_FAILURE', '08006'],
    [privateError('ENOTFOUND'), 'DATABASE_NETWORK_FAILURE', 'ENOTFOUND'],
    [privateError('ETIMEDOUT'), 'DATABASE_TIMEOUT', 'ETIMEDOUT'],
    [new Error('Connection terminated due to connection timeout', { cause: privateError('ECONNRESET') }),
      'DATABASE_TIMEOUT', 'PG_POOL_TIMEOUT'],
    [Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
      'DATABASE_TIMEOUT', '57014'],
    [privateError('ERR_TLS_CERT_ALTNAME_INVALID'), 'DATABASE_TLS_FAILURE', 'ERR_TLS_CERT_ALTNAME_INVALID'],
    [privateError('UNABLE_TO_VERIFY_LEAF_SIGNATURE'), 'DATABASE_TLS_FAILURE', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'],
    [new Error('HOSTED_RUNTIME_ROLE_REQUIRED', { cause: privateError('42501') }),
      'DATABASE_ROLE_GUARD_FAILURE', 'HOSTED_RUNTIME_ROLE_REQUIRED'],
    [privateError('42501'), 'DATABASE_SCHEMA_FAILURE', '42501'],
    [privateError('42883'), 'DATABASE_SCHEMA_FAILURE', '42883'],
    [privateError(privateText), 'UNKNOWN_INTERNAL_FAILURE'],
    [null, 'UNKNOWN_INTERNAL_FAILURE'],
  ];
  for (const [failure, category, code] of cases) {
    const logs = [];
    const fetch = createVercelPreview({ env, log: event => logs.push(event), connect: () => ({
      transact: async () => { throw failure; },
    }) });
    const response = await fetch(request('/v1/health/ready'));
    assert.equal(response.status, 503);
    const { error } = await response.json();
    assert.match(error.request_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(error, { code: 'UNAVAILABLE', message: 'The demo service is temporarily unavailable.',
      request_id: error.request_id });
    assert.deepEqual(logs, [{ event: 'hosted_request_unavailable', request_id: error.request_id,
      category, ...(code ? { code } : {}) }]);
  }
});

test('Vercel readiness diagnoses database configuration rejected by the real connector', async () => {
  for (const [settings, code] of [
    [{}, 'HOSTED_DATABASE_CONFIGURATION_REQUIRED'],
    [{ HOSTED_DATABASE_URL: privateText + '?sslmode=disable', HOSTED_DATABASE_CA: 'test-only-ca' },
      'HOSTED_DATABASE_CONFIGURATION_INVALID'],
  ]) {
    const logs = [];
    const fetch = createVercelPreview({ env: { ...env, ...settings }, log: event => logs.push(event) });
    const response = await fetch(request('/v1/health/ready'));
    assert.equal(response.status, 503);
    const { error } = await response.json();
    assert.deepEqual(error, { code: 'UNAVAILABLE', message: 'The demo service is temporarily unavailable.',
      request_id: error.request_id });
    assert.match(error.request_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(logs, [{ event: 'hosted_request_unavailable', request_id: error.request_id,
      category: 'DATABASE_CONFIGURATION_FAILURE', code }]);
  }
});

test('Vercel logs a readiness schema failure while preserving stale-evidence rejection', async () => {
  const logs = [];
  const fetch = createVercelPreview({ env, log: event => logs.push(event), connect: () => ({
    transact: action => action({ query: async sql => {
      if (sql === 'SELECT hyd_demo.hosted_ready() AS value') return { rows: [{ value: false }] };
      if (sql.startsWith('SELECT hyd_demo.review_followup(')) {
        throw new Error('STALE_EVIDENCE', { cause: privateError('08006') });
      }
      return { rows: [{ value: true }] };
    } }),
  }) });
  const ready = await fetch(request('/v1/health/ready'));
  assert.equal(ready.status, 503);
  const { error } = await ready.json();
  assert.equal(error.code, 'NOT_READY');
  assert.deepEqual(logs, [{ event: 'hosted_request_unavailable', request_id: error.request_id,
    category: 'DATABASE_SCHEMA_FAILURE', code: 'NOT_READY' }]);

  const response = await fetch(request('/v1/followups/drafts', {
    method: 'POST', headers: { origin, cookie: '__Host-vishwas_demo=' + 'a'.repeat(43),
      'content-type': 'application/json' }, body: JSON.stringify({
      commitment_id: '00000000-0000-4000-8000-000000000001', expected_version: 1,
      language: 'en-IN', tone: 'POLITE', facts_hash: 'a'.repeat(64), confirm_review: true,
    }),
  }));
  assert.equal(response.status, 409);
  const stale = await response.json();
  assert.match(stale.error.request_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(stale, { error: { code: 'STALE_EVIDENCE',
    message: 'Review the latest recorded data and retry with the correct details.', request_id: stale.error.request_id } });
  assert.equal(logs.length, 1);
});
