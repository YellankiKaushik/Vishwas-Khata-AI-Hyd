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
