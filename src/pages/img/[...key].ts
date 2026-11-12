import type { APIRoute } from 'astro';
import { env } from '../../server/site';
import { getPhoto, PHOTO_CACHE_CONTROL } from '../../server/storage';

/**
 * Раздача фото из Supabase Storage через функцию сайта.
 * Ключи неизменяемые — браузер и CDN Vercel кешируют ответ на год, функция вызывается один раз на фото.
 */
export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  if (!/^lots\/[\w./-]+\.(webp|jpg)$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
  const photo = await getPhoto(env, key);
  if (!photo) return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const headers = new Headers({
    'content-type': photo.contentType,
    'cache-control': PHOTO_CACHE_CONTROL,
    'Vercel-CDN-Cache-Control': PHOTO_CACHE_CONTROL,
  });
  if (photo.etag) headers.set('etag', photo.etag);
  return new Response(photo.body, { headers });
};
