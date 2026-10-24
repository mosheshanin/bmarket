import { handle } from '@astrojs/cloudflare/handler';
import { getDb } from './db/client';
import { cachedFetch, isCacheablePath, setBuildVersion } from './server/cache';
import { processBroadcasts } from './server/broadcast';
import { updateRates } from './server/rates';
import { anonymizeOldLeads, purgeDeletedPhotos, removeAbandonedSellerDrafts } from './server/maintenance';
import { setVisitorSalt } from './server/events';
import { appSecret } from './server/secrets';
import { ensureBotSetup } from './server/bot-setup';
import { reconcilePayments } from './server/seller';

/**
 * Точка входа Worker: страницы и API отдаёт Astro, публичные страницы кешируются на 10 минут,
 * задачи по расписанию запускаются внутри Cloudflare (внешнего адреса у них нет).
 */
export default {
  async fetch(request, env, ctx) {
    setVisitorSalt(await appSecret(env));
    setBuildVersion(env.CF_VERSION_METADATA?.id);
    const url = new URL(request.url);
    if (request.method === 'GET' && isCacheablePath(url.pathname)) {
      return cachedFetch(request, () => handle(request, env, ctx), ctx);
    }
    return handle(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    setVisitorSalt(await appSecret(env));
    const db = getDb(env.DB);
    if (controller.cron === '0 14 * * *') {
      // Ежедневно 14:00 UTC — после публикации курса Банком Израиля.
      ctx.waitUntil(
        (async () => {
          await updateRates(env, db);
          const anonymized = await anonymizeOldLeads(db);
          const abandoned = await removeAbandonedSellerDrafts(db);
          const purged = await purgeDeletedPhotos(env, db);
          console.log('daily maintenance', { anonymized, abandoned, purged });
        })(),
      );
      return;
    }
    // Каждую минуту: после нового деплоя — самонастройка бота; затем порция рассылки подписчикам.
    ctx.waitUntil(
      (async () => {
        await ensureBotSetup(env, db).catch((e) => console.error('bot setup failed', e));
        await processBroadcasts(env, db);
        // Оплаты PayPal, по которым продавец не вернулся на сайт.
        await reconcilePayments(env, db).catch((e) => console.error('reconcile payments failed', e));
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
