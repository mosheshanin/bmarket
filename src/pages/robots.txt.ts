import type { APIRoute } from 'astro';
import { site } from '../server/site';

export const GET: APIRoute = () => {
  const base = site().url;
  const body = ['User-agent: *', 'Disallow: /admin', 'Disallow: /api', 'Disallow: /*/request', '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8', 'x-bm-cacheable': '1' } });
};
