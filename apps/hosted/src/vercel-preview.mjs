import { isIP } from 'node:net';
import gate from '../release-gate.json' with { type: 'json' };
import { openDatabase } from './database.mjs';
import { createHandler } from './handler.mjs';

const sha = /^[0-9a-f]{40}$/;
const routeParam = '__vishwas_route';
const reply = (data, status) => Response.json(data, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const error = (code, status) => reply({ error: { code } }, status);

function previewOrigin(env) {
  const origin = env.HOSTED_PUBLIC_ORIGIN;
  const url = URL.parse(origin || '');
  return url?.protocol === 'https:' && url.origin === origin ? url : null;
}

const connectPreview = (url, ca) => openDatabase(url, ca, { maxConnections: 2, idleTimeoutMillis: 1000 });

export function createVercelPreview({ connect = connectPreview, env = process.env,
  log = event => console.error(JSON.stringify(event)) } = {}) {
  let handle;
  return async request => {
    const url = new URL(request.url);
    if (url.href.length > 2048) return error('INVALID_INPUT', 422);
    const origin = previewOrigin(env);
    if (!origin || request.headers.get('host') !== origin.host || url.origin !== origin.origin)
      return error('ORIGIN_DENIED', 403);
    // Vercel may pass either the original URL or the internal rewrite URL.
    if (url.pathname === '/api/merchant') {
      const routes = url.searchParams.getAll(routeParam);
      if (routes.length !== 1 || !/^[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$/i.test(routes[0]))
        return error('ROUTE_NOT_FOUND', 404);
      url.pathname = '/v1/' + routes[0];
    }
    url.searchParams.delete(routeParam);
    if (!url.pathname.startsWith('/v1/')) return error('ROUTE_NOT_FOUND', 404);
    if (request.method === 'GET' && url.pathname === '/v1/health/live')
      return reply({ status: 'alive' }, 200);

    if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview' ||
        gate.restricted_vercel_preview_supported !== true ||
        !sha.test(env.VERCEL_GIT_COMMIT_SHA || '') ||
        env.HOSTED_PREVIEW_ACCEPTED_SHA !== env.VERCEL_GIT_COMMIT_SHA) {
      return error('PREVIEW_GATE_CLOSED', 503);
    }
    try {
      if (!handle) {
        // Validate origin and session secret before allocating the module-scoped pool.
        const config = { origin: origin.origin, secret: env.HOSTED_SESSION_SECRET, log };
        let database;
        handle = createHandler({ ...config, transact: action => {
          database ??= connect(env.HOSTED_DATABASE_URL, env.HOSTED_DATABASE_CA);
          return database.transact(action);
        } });
      }
      const address = request.headers.get('x-vercel-forwarded-for');
      const forwarded = new Request(url, {
        method: request.method, headers: request.headers, signal: request.signal,
        ...(request.body ? { body: request.body, duplex: 'half' } : {}),
      });
      return await handle(forwarded, { clientAddress: isIP(address || '') ? address : 'unavailable' });
    } catch {
      log({ event: 'vercel_preview_unavailable' });
      return error('NOT_READY', 503);
    }
  };
}
