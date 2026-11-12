import { sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { settings } from '../db/schema';
import { ensureBotSetup } from './bot-setup';
import { processBroadcasts } from './broadcast';
import { anonymizeOldLeads, purgeDeletedPhotos, removeAbandonedSellerDrafts } from './maintenance';
import { updateRates } from './rates';
import { reconcilePayments } from './seller';
import { safeEqual } from '../lib/crypto';

/**
 * Задачи по расписанию (раньше — scheduled() у Cloudflare Worker).
 *   /api/cron/minute — каждую минуту (Supabase pg_cron + pg_net): самонастройка бота после деплоя,
 *                      порция рассылки подписчикам, сверка оплат PayPal;
 *   /api/cron/daily  — ежедневно в 14:00 UTC (Vercel Cron): курсы Банка Израиля и обслуживание базы.
 * Оба адреса принимают только «Authorization: Bearer <CRON_SECRET>» (так же их вызывает Vercel Cron).
 */
export function cronAuthorized(env: Env, req: Request): boolean {
  const secret = env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`);
}

/**
 * Аренда на 50 секунд в settings: если предыдущий запуск ещё идёт (или pg_cron вызвал дважды),
 * второй не начинает рассылку повторно. Атомарно: один INSERT … ON CONFLICT … WHERE.
 */
async function takeLease(db: DB, key: string, ttlMs: number, now = Date.now()): Promise<boolean> {
  const rows = await db.execute(sql`
    insert into ${settings} (key, value) values (${key}, ${String(now)})
    on conflict (key) do update set value = excluded.value
      where ${settings.value}::bigint < ${now - ttlMs}::bigint
    returning key`);
  return rows.length > 0;
}

export async function runMinute(env: Env, db: DB) {
  if (!(await takeLease(db, 'cron_minute_lease', 50_000))) return { skipped: true };
  const bot = await ensureBotSetup(env, db).catch((e) => {
    console.error('bot setup failed', e);
    return false;
  });
  await processBroadcasts(env, db);
  // Оплаты PayPal, по которым продавец не вернулся на сайт.
  const settled = await reconcilePayments(env, db).catch((e) => {
    console.error('reconcile payments failed', e);
    return 0;
  });
  return { botSetup: bot, settled };
}

export async function runDaily(env: Env, db: DB) {
  // Ежедневно 14:00 UTC — после публикации курса Банком Израиля.
  await updateRates(env, db);
  const anonymized = await anonymizeOldLeads(db);
  const abandoned = await removeAbandonedSellerDrafts(db);
  const purged = await purgeDeletedPhotos(env, db);
  const r = { anonymized, abandoned, purged };
  console.log('daily maintenance', r);
  return r;
}
