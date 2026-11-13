import type { APIRoute } from 'astro';
import { sitemapEntries } from '../server/public';
import { db, site } from '../server/site';
import { businessPath } from '../lib/slug';

/**
 * Карта сайта: главная, города с объявлениями, опубликованные лоты, «О сервисе».
 * lastmod города — самая поздняя правка его лотов (13.11.2026). priority/changefreq Google не учитывает — не пишем.
 */
export const GET: APIRoute = async () => {
  const { lots, cities } = await sitemapEntries(db());
  const base = site().url;
  const iso = (ts: number) => new Date(ts).toISOString();
  const latest = lots.reduce((m, l) => Math.max(m, l.updatedAt), 0);
  const cityLatest = new Map<number, number>();
  for (const l of lots) if (l.cityId) cityLatest.set(l.cityId, Math.max(cityLatest.get(l.cityId) ?? 0, l.updatedAt));
  const lastmod = (ts: number | undefined) => (ts ? `<lastmod>${iso(ts)}</lastmod>` : '');
  const urls = [
    `<url><loc>${base}/</loc>${lastmod(latest)}</url>`,
    ...cities.map((c) => `<url><loc>${base}/city/${c.slug}</loc>${lastmod(cityLatest.get(c.id))}</url>`),
    ...lots.map((l) => `<url><loc>${base}${businessPath(l.lotNumber, l.slug)}</loc>${lastmod(l.updatedAt)}</url>`),
    `<url><loc>${base}/about</loc></url>`,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'x-bm-cacheable': '1' } });
};
