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
  setVisitorSalt(await appSecret(env));
  const res = await next();
  return applyPageCache(context.request, res);
});
