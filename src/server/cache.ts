/**
 * Кеш публичных страниц в Cloudflare (Cache API), 10 минут (раздел 10.1).
 * Ключ — origin + путь без query (UTM и прочие параметры не дробят кеш).
 * Cache API работает только на собственном домене; на *.workers.dev — молча no-op.
 */
export const PAGE_TTL_SEC = 600;
export const CACHEABLE_HEADER = 'x-bm-cacheable';

const CACHEABLE = [/^\/$/, /^\/city\/[^/]+$/, /^\/business\/[^/]+(\/request)?$/, /^\/(about|privacy)$/, /^\/sitemap\.xml$/, /^\/robots\.txt$/];

export function isCacheablePath(pathname: string): boolean {
  return CACHEABLE.some((r) => r.test(pathname));
}

/**
 * Версия сборки в ключе: после деплоя старый HTML (со ссылками на уже удалённые
 * /_astro/*.css и *.js с другими хешами) из кеша не отдаётся.
 */
let buildVersion = 'dev';
export function setBuildVersion(v: string | undefined) {
  if (v) buildVersion = v;
}

function cacheKey(origin: string, path: string): Request {
  return new Request(`${origin.replace(/\/$/, '')}${path}?__v=${encodeURIComponent(buildVersion)}`, { method: 'GET' });
}

function getCache(): Cache | null {
  try {
    return (globalThis as unknown as { caches?: { default: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

export async function cachedFetch(
  req: Request,
  render: () => Promise<Response>,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(req.url);
  const cache = getCache();
  // Предпросмотр админом и прочие служебные режимы — мимо кеша.
  if (!cache || url.searchParams.has('preview')) return render();
  const key = cacheKey(url.origin, url.pathname);
  const hit = await cache.match(key);
  if (hit) {
    const r = new Response(hit.body, hit);
    r.headers.set('x-bm-cache', 'HIT');
    r.headers.set('cache-control', 'public, max-age=0, must-revalidate');
    return r;
  }
  const res = await render();
  if (res.headers.get(CACHEABLE_HEADER) === '1' && [200, 301, 404, 410].includes(res.status)) {
    const toStore = new Response(res.clone().body, res);
    toStore.headers.set('cache-control', `public, max-age=${PAGE_TTL_SEC}`);
    toStore.headers.delete('set-cookie');
    ctx.waitUntil(cache.put(key, toStore));
  }
  const out = new Response(res.body, res);
  out.headers.delete(CACHEABLE_HEADER);
  out.headers.set('x-bm-cache', 'MISS');
  if (!out.headers.has('cache-control')) out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  return out;
}

/** Сбросить кеш страниц сразу после изменений в админке. */
export async function purgePaths(origins: string[], paths: string[]): Promise<void> {
  const cache = getCache();
  if (!cache) return;
  const uniqOrigins = [...new Set(origins.filter(Boolean).map((o) => new URL(o).origin))];
  await Promise.all(
    uniqOrigins.flatMap((o) => [...new Set(paths)].map((p) => cache.delete(cacheKey(o, p)).catch(() => false))),
  );
}
