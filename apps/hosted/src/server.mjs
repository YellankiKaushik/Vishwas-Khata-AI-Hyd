import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { Readable } from 'node:stream';
import { createHandler } from './handler.mjs';
import { openDatabase } from './database.mjs';

const origin = process.env.HOSTED_PUBLIC_ORIGIN;
const expectedHost = new URL(origin).host;
const root = resolve(process.env.HOSTED_WEB_DIST || '../web/dist');
const { transact } = openDatabase(process.env.HOSTED_DATABASE_URL, process.env.HOSTED_DATABASE_CA);
const handle = createHandler({ transact, origin, secret: process.env.HOSTED_SESSION_SECRET,
  log: event => console.error(JSON.stringify(event)) });
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

const server = createServer(async (req, res) => {
  try {
    // Run behind an HTTPS terminator that preserves Host and can reach the private listener.
    if (req.headers.host !== expectedHost || !req.url?.startsWith('/') ||
        req.url.startsWith('//') || req.url.includes('\\') || req.url.length > 2048) {
      res.writeHead(400, security).end();
      return;
    }
    const url = new URL(req.url, origin);
    if (url.pathname.startsWith('/v1/')) {
      const input = new Request(url, { method: req.method, headers: req.headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} :
          (req.headers['content-length'] === '0' || (!req.headers['content-length'] && !req.headers['transfer-encoding'])) ? {} :
            { body: Readable.toWeb(req), duplex: 'half' }) });
      // The peer address is the only trusted address until the ingress is configured to
      // replace forwarded headers. Global creation quotas still apply behind a proxy.
      const response = await handle(input, { clientAddress: req.socket.remoteAddress });
      res.writeHead(response.status, { ...security, ...Object.fromEntries(response.headers) });
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
      if (!req.complete) req.resume();
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
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 8080), process.env.HOSTED_BIND_ADDRESS || '127.0.0.1');
