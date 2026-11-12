// Локальный запуск собранного сайта так же, как на Vercel: статика из .vercel/output/static,
// остальное — функция _render. Переменные — из .env.  npm run preview  (порт PORT, по умолчанию 8787)
import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { Readable } from 'node:stream';
import { loadEnv } from './load-env.mjs';

loadEnv();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
const STATIC = '.vercel/output/static';
const { default: fn } = await import(new URL('../.vercel/output/functions/_render.func/dist/server/entry.mjs', import.meta.url).href);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.gif': 'image/gif', '.mp4': 'video/mp4' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      res.writeHead(308, { location: url.pathname.slice(0, -1) + url.search }).end();
      return;
    }
    const file = normalize(join(STATIC, decodeURIComponent(url.pathname)));
    if (file.startsWith(STATIC) && existsSync(file) && statSync(file).isFile() && req.method === 'GET') {
      const headers = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' };
      if (url.pathname.startsWith('/_astro/')) headers['cache-control'] = 'public, max-age=31536000, immutable';
      res.writeHead(200, headers);
      createReadStream(file).pipe(res);
      return;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.set('x-forwarded-for', req.socket.remoteAddress ?? '127.0.0.1');
    const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET');
    const request = new Request(url, { method: req.method, headers, ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
    const r = await fn.fetch(request);
    const out = {};
    r.headers.forEach((v, k) => {
      if (k !== 'set-cookie') out[k] = v;
    });
    const cookies = r.headers.getSetCookie?.() ?? [];
    if (cookies.length) out['set-cookie'] = cookies;
    res.writeHead(r.status, out);
    if (r.body) Readable.fromWeb(r.body).pipe(res);
    else res.end();
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Internal error');
  }
}).listen(port, host, () => console.log(`http://${host}:${port}`));
