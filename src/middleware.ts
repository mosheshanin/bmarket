import { defineMiddleware } from 'astro:middleware';
import { applyPageCache } from './server/cache';
import { setVisitorSalt } from './server/events';
import { appSecret } from './server/secrets';
import { env } from './server/env';

/**
 * Общая обработка запросов (раньше — fetch() в src/worker.ts):
 * соль обезличенных хешей и заголовки кеша CDN для публичных страниц.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const redirect = canonicalHostRedirect(context.request);
  if (redirect) return redirect;
  setVisitorSalt(await appSecret(env));
  const res = await next();
  return applyPageCache(context.request, res);
});

/**
 * Один адрес сайта для поисковиков (13.11.2026): в production страницы, открытые не с хоста SITE_URL
 * (например, *.vercel.app), отвечают 301 на тот же путь основного домена. API, вебхук и cron не трогаем —
 * их вызывают по точным адресам. Preview-деплои (VERCEL_ENV=preview) и локальная сборка работают как раньше.
 */
export function canonicalHostRedirect(req: Request): Response | null {
  if (env.VERCEL_ENV !== 'production' || !env.SITE_URL) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return null;
  const canonical = new URL(env.SITE_URL);
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || url.host).split(',')[0].trim().toLowerCase();
  // Перенаправляем только служебные адреса Vercel: неизвестный хост (или внутренний адрес функции) не трогаем,
  // чтобы ошибка в определении хоста не дала петлю перенаправлений на основном домене.
  if (host === canonical.host || !host.endsWith('.vercel.app')) return null;
  return new Response(null, { status: 301, headers: { location: canonical.origin + url.pathname + url.search, 'cache-control': 'public, max-age=3600' } });
}
