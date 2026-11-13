import type { APIRoute } from 'astro';
import { site } from '../server/site';

export const GET: APIRoute = () => {
  const base = site().url;
  // /business/*/request не закрываем: у страницы заявки мета noindex, а за Disallow поисковик её бы не увидел (13.11.2026).
  const body = ['User-agent: *', 'Disallow: /admin', 'Disallow: /api', 'Disallow: /pay/', '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-bm-cacheable': '1' } });
};
