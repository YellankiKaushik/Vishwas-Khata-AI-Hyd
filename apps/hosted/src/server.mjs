import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { publicReleaseReady } from '../scripts/preflight.mjs';
import { createHandler } from './handler.mjs';
import { openDatabase } from './database.mjs';
import { createVercelPreview } from './vercel-preview.mjs';

const certificateFile = process.env.HOSTED_LOCAL_TLS_CERT_FILE;
const keyFile = process.env.HOSTED_LOCAL_TLS_KEY_FILE;
const bindAddress = process.env.HOSTED_BIND_ADDRESS || '127.0.0.1';
const localTLS = Boolean(certificateFile || keyFile);
if (!localTLS && !publicReleaseReady) throw new Error('HOSTED_PUBLIC_RELEASE_GATE_CLOSED');

const origin = process.env.HOSTED_PUBLIC_ORIGIN;
const publicUrl = new URL(origin);
if (localTLS && (!certificateFile || !keyFile || bindAddress !== '127.0.0.1' ||
    !['127.0.0.1', 'localhost'].includes(publicUrl.hostname))) {
  throw new Error('INVALID_LOCAL_TLS_CONFIGURATION');
}
const expectedHost = publicUrl.host;
const root = resolve(process.env.HOSTED_WEB_DIST || '../web/dist');
const log = event => console.error(JSON.stringify(event));
const previewAcceptance = process.env.HOSTED_LOCAL_VERCEL_ACCEPTANCE === '1';
let handle;
if (previewAcceptance) {
  if (!localTLS || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
      !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || '')) throw new Error('INVALID_VERCEL_ACCEPTANCE_CONFIGURATION');
  handle = createVercelPreview({
    env: { ...process.env, VERCEL: '1', VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: process.env.GITHUB_SHA, HOSTED_PREVIEW_ACCEPTED_SHA: process.env.GITHUB_SHA },
  });
} else {
  const { transact } = openDatabase(process.env.HOSTED_DATABASE_URL, process.env.HOSTED_DATABASE_CA);
  handle = createHandler({ transact, origin, secret: process.env.HOSTED_SESSION_SECRET, log });
}
const mime = new Map([['.html', 'text/html; charset=utf-8'], ['.css','text/css; charset=utf-8'],
  ['.js','text/javascript; charset=utf-8'], ['.svg','image/svg+xml'], ['.png','image/png'],
  ['.ico','image/x-icon'], ['.woff2','font/woff2']]);
const security = {
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'; media-src 'self' blob:",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

async function serve(req, res) {
  try {
    // Run behind an HTTPS terminator that preserves Host and can reach the private listener.
    if (req.headers.host !== expectedHost || !req.url?.startsWith('/') ||
        req.url.startsWith('//') || req.url.includes('\\') || req.url.length > 2048) {
      res.writeHead(400, security).end();
      return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/v1/') || (previewAcceptance && url.pathname === '/api/merchant')) {
      const input = new Request(url, { method: req.method, headers: req.headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} :
          (req.headers['content-length'] === '0' || (!req.headers['content-length'] && !req.headers['transfer-encoding'])) ? {} :
            { body: Readable.toWeb(req), duplex: 'half' }) });
      // The peer address is the only trusted address until the ingress is configured to
      // replace forwarded headers. Global creation quotas still apply behind a proxy.
      const response = await handle(input, { clientAddress: req.socket.remoteAddress });
      // Finish the structured response before closing an unread upload.
      if (!req.readableEnded) {
        res.setHeader('Connection', 'close');
        res.shouldKeepAlive = false;
      }
      res.writeHead(response.status, { ...security, ...Object.fromEntries(response.headers) });
      if (response.body) Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
      else res.end();
      return;
    }
    if (!['GET','HEAD'].includes(req.method)) {
      res.writeHead(405, security).end();
      return;
    }
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = resolve(root, name);
    const type = mime.get(extname(file));
    if (!file.startsWith(root + sep) || !type || !(await stat(file).catch(() => null))?.isFile()) {
      res.writeHead(404, security).end();
      return;
    }
    res.writeHead(200, { ...security, 'Content-Type': type, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    if (res.headersSent) res.destroy();
    else res.writeHead(503, security).end();
    console.error(JSON.stringify({ event: 'hosted_transport_failure' }));
  }
}
const server = localTLS
  ? createSecureServer({ cert: await readFile(certificateFile), key: await readFile(keyFile), minVersion: 'TLSv1.2' }, serve)
  : createServer(serve);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 8080), bindAddress);
