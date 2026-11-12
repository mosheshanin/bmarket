import { dangerouslyDeleteByTag } from '@vercel/functions';

/**
 * Кеш публичных страниц в CDN Vercel, 10 минут (раздел 10.1).
 * Страница помечает себя заголовком x-bm-cacheable: 1, а src/middleware.ts превращает его
 * в Vercel-CDN-Cache-Control (кеш CDN) и Vercel-Cache-Tag (тег «path:<путь>» для сброса).
 * Браузер не кеширует (max-age=0), поэтому после сброса посетитель сразу видит новое.
 * Новый деплой Vercel сам начинает с пустого кеша — версия сборки в ключе больше не нужна.
 */
export const PAGE_TTL_SEC = 600;
export const CACHEABLE_HEADER = 'x-bm-cacheable';

const CACHEABLE = [/^\/$/, /^\/city\/[^/]+$/, /^\/business\/[^/]+(\/request)?$/, /^\/(about|privacy)$/, /^\/sitemap\.xml$/, /^\/robots\.txt$/];

export function isCacheablePath(pathname: string): boolean {
  return CACHEABLE.some((r) => r.test(pathname));
}

/** Тег кеша для пути. Запятые в тегах запрещены, длина — до 256 байт. */
export function pathTag(path: string): string {
  return `path:${path}`.replace(/,/g, '%2C').slice(0, 250);
}

/** Заголовки кеширования для ответа публичной страницы (или удаление метки, если кешировать нельзя). */
export function applyPageCache(req: Request, res: Response): Response {
  const url = new URL(req.url);
  const marked = res.headers.get(CACHEABLE_HEADER) === '1';
  let out = res;
  try {
    res.headers.delete(CACHEABLE_HEADER);
  } catch {
    // Заголовки ответа неизменяемы (например, redirect) — копируем.
    out = new Response(res.body, res);
    out.headers.delete(CACHEABLE_HEADER);
  }
  const cacheable =
    marked &&
    req.method === 'GET' &&
    isCacheablePath(url.pathname) &&
    !url.searchParams.has('preview') &&
    [200, 301, 404, 410].includes(out.status) &&
    !out.headers.has('set-cookie');
  if (cacheable) {
    out.headers.set('Vercel-CDN-Cache-Control', `public, max-age=${PAGE_TTL_SEC}`);
    out.headers.set('Vercel-Cache-Tag', `pages,${pathTag(url.pathname)}`);
  }
  if (!out.headers.has('cache-control')) out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  out.headers.set('x-bm-cache', cacheable ? 'CDN' : 'BYPASS');
  return out;
}

/** Сбросить кеш страниц сразу после изменений в админке (origins оставлены для совместимости вызовов). */
export async function purgePaths(_origins: string[], paths: string[]): Promise<void> {
  const tags = [...new Set(paths)].map(pathTag);
  for (let i = 0; i < tags.length; i += 100) {
    // Удаление (а не «устаревание»): следующий посетитель сразу получает новую версию, как раньше с Cache API.
    await dangerouslyDeleteByTag(tags.slice(i, i + 100)).catch((e) => console.error('cache purge failed', e));
  }
}
