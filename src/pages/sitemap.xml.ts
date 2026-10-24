import type { APIRoute } from 'astro';
import { sitemapEntries } from '../server/public';
import { db, site } from '../server/site';
import { businessPath } from '../lib/slug';

/** Карта сайта: главная, города с объявлениями, опубликованные лоты с датой изменения. */
export const GET: APIRoute = async () => {
  const { lots, cities } = await sitemapEntries(db());
  const base = site().url;
  const iso = (ts: number) => new Date(ts).toISOString();
  const latest = lots.reduce((m, l) => Math.max(m, l.updatedAt), 0);
  const urls = [
    `<url><loc>${base}/</loc>${latest ? `<lastmod>${iso(latest)}</lastmod>` : ''}<changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...cities.map((c) => `<url><loc>${base}/city/${c.slug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`),
    ...lots.map((l) => `<url><loc>${base}${businessPath(l.lotNumber, l.slug)}</loc><lastmod>${iso(l.updatedAt)}</lastmod><priority>0.9</priority></url>`),
    `<url><loc>${base}/about</loc><priority>0.3</priority></url>`,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'x-bm-cacheable': '1' } });
};
