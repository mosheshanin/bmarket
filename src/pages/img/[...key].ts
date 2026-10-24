import type { APIRoute } from 'astro';
import { env } from '../../server/site';
import { getPhoto, PHOTO_CACHE_CONTROL } from '../../server/storage';

/**
 * Раздача фото из хранилища (KV или R2) через Worker.
 * Ключи неизменяемые — браузер и Cloudflare кешируют ответ на год.
 */
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^lots\/[\w./-]+\.(webp|jpg)$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
  const cache = (globalThis as unknown as { caches?: { default: Cache } }).caches?.default;
  const hit = await cache?.match(request);
  if (hit) return hit;
  const photo = await getPhoto(env, key);
  if (!photo) return new Response('Not found', { status: 404 });
  const headers = new Headers({ 'content-type': photo.contentType, 'cache-control': PHOTO_CACHE_CONTROL });
  if (photo.etag) headers.set('etag', photo.etag);
  const res = new Response(photo.body, { headers });
  if (cache) await cache.put(request, res.clone()).catch(() => {});
  return res;
};
