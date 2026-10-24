import type { APIRoute } from 'astro';
import { env } from '../../server/site';

/**
 * Раздача фото из R2 через Worker — запасной вариант, пока не подключён поддомен img.<домен>
 * (PUBLIC_IMAGES_URL пустой). Ответ кешируется браузером и Cloudflare на год: ключи неизменяемые.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^lots\/[\w./-]+\.(webp|jpg)$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
  const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
  const hit = await cache?.match(request);
  if (hit) return hit;
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  const res = new Response(obj.body, { headers });
  if (cache) await cache.put(request, res.clone()).catch(() => {});
  return res;
};
