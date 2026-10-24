import { and, asc, desc, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import type { InlineKeyboardButton } from 'grammy/types';
import type { DB } from '../db/client';
import { broadcasts, businesses, subscribers, type Broadcast } from '../db/schema';
import { escapeHtml, formatIls, groupDigits } from '../lib/format';
import { businessPath } from '../lib/slug';
import { photosFor } from './public';
import { absoluteImageUrl, isBlockedError, notifyManagers, retryAfterSec, siteUrl, tgApi } from './telegram';

/** Порция за один запуск: бесплатный Workers — не более 50 внешних запросов за вызов. */
export const BATCH_SIZE = 40;
/** Не более одной рассылки в 2 часа. */
export const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;
/** Небольшая пауза, чтобы лоты, опубликованные подряд, ушли одной подборкой. */
export const GRACE_MS = 2 * 60 * 1000;
const MAX_LOTS_IN_DIGEST = 8;

/**
 * Поставить лот в рассылку. Вызывается при первой публикации с включённым «Уведомить подписчиков».
 * Лот получает notified_at — повторная публикация после снятия рассылку не вызывает.
 */
export async function queueLotNotification(db: DB, businessId: number, now = Date.now()): Promise<Broadcast | null> {
  const marked = await db
    .update(businesses)
    .set({ notifiedAt: now })
    .where(and(eq(businesses.id, businessId), isNull(businesses.notifiedAt)))
    .returning({ id: businesses.id });
  if (!marked.length) return null; // по лоту уже была рассылка

  const [pending] = await db.select().from(broadcasts).where(eq(broadcasts.status, 'pending')).orderBy(asc(broadcasts.id)).limit(1);
  if (pending) {
    const ids = pending.businessIds.includes(businessId) ? pending.businessIds : [...pending.businessIds, businessId];
    const [u] = await db.update(broadcasts).set({ businessIds: ids }).where(eq(broadcasts.id, pending.id)).returning();
    return u ?? pending;
  }
  const [last] = await db.select().from(broadcasts).orderBy(desc(broadcasts.scheduledAt)).limit(1);
  const scheduledAt = Math.max(now + GRACE_MS, last ? last.scheduledAt + MIN_INTERVAL_MS : 0);
  const [created] = await db
    .insert(broadcasts)
    .values({ status: 'pending', businessIds: [businessId], scheduledAt, createdAt: now })
    .returning();
  return created ?? null;
}

interface DigestLot {
  id: number;
  lotNumber: number;
  slug: string;
  publicTitle: string;
  priceIls: number | null;
  monthlyProfitIls: number | null;
  coverKey: string | null;
}

async function loadLots(db: DB, ids: number[]): Promise<DigestLot[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: businesses.id, lotNumber: businesses.lotNumber, slug: businesses.slug, publicTitle: businesses.publicTitle,
      priceIls: businesses.priceIls, monthlyProfitIls: businesses.monthlyProfitIls,
    })
    .from(businesses)
    .where(and(inArray(businesses.id, ids), eq(businesses.status, 'published')));
  const photos = await photosFor(db, rows.map((r) => r.id));
  const cover = new Map<number, string>();
  for (const p of photos) if (!cover.has(p.businessId)) cover.set(p.businessId, p.r2Key);
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows
    .map((r) => ({ ...r, coverKey: cover.get(r.id) ?? null }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function lotLine(l: DigestLot): string {
  const parts = [escapeHtml(l.publicTitle)];
  if (l.priceIls) parts.push(formatIls(l.priceIls));
  if (l.monthlyProfitIls) parts.push(`прибыль ₪ ${groupDigits(l.monthlyProfitIls)} в месяц`);
  return parts.join(' · ');
}

function openButton(env: Env, text: string, path: string): InlineKeyboardButton {
  const url = siteUrl(env) + path;
  // Кнопка web_app открывает мини-приложение прямо на карточке (только https).
  return url.startsWith('https://') ? { text, web_app: { url } } : { text, url };
}

export function buildMessage(env: Env, lots: DigestLot[]) {
  const unsubscribe: InlineKeyboardButton = { text: 'Отписаться', callback_data: 'unsub' };
  if (lots.length === 1) {
    const l = lots[0];
    return {
      text: `🆕 <b>Новый бизнес на продажу</b>\n\n${lotLine(l)}\n\nЛот №${l.lotNumber}`,
      photo: l.coverKey ? absoluteImageUrl(env, l.coverKey) : null,
      keyboard: [[openButton(env, 'Смотреть', businessPath(l.lotNumber, l.slug))], [unsubscribe]],
    };
  }
  const shown = lots.slice(0, MAX_LOTS_IN_DIGEST);
  const rest = lots.length - shown.length;
  const text = [
    `🆕 <b>Новые бизнесы на продажу</b>`,
    '',
    ...shown.map((l) => `• №${l.lotNumber} — ${lotLine(l)}`),
    ...(rest > 0 ? ['', `И ещё ${rest} — в каталоге.`] : []),
  ].join('\n');
  const buttons = shown.map((l) => [openButton(env, `Смотреть №${l.lotNumber}`, businessPath(l.lotNumber, l.slug))]);
  if (rest > 0) buttons.push([openButton(env, 'Весь каталог', '/')]);
  buttons.push([unsubscribe]);
  const cover = shown.find((l) => l.coverKey)?.coverKey ?? null;
  return { text, photo: cover ? absoluteImageUrl(env, cover) : null, keyboard: buttons };
}

/** Запуск раз в минуту: обработать одну порцию активной рассылки. */
export async function processBroadcasts(env: Env, db: DB, now = Date.now()): Promise<void> {
  const [job] = await db
    .select()
    .from(broadcasts)
    .where(and(inArray(broadcasts.status, ['pending', 'sending']), lte(broadcasts.scheduledAt, now)))
    .orderBy(asc(broadcasts.id))
    .limit(1);
  if (!job) return;
  if (job.status === 'pending') {
    await db.update(broadcasts).set({ status: 'sending', startedAt: now }).where(eq(broadcasts.id, job.id));
  }

  const lots = await loadLots(db, job.businessIds);
  if (!lots.length) {
    await db.update(broadcasts).set({ status: 'done', finishedAt: now }).where(eq(broadcasts.id, job.id));
    return;
  }
  const msg = buildMessage(env, lots);
  const batch = await db
    .select({ id: subscribers.telegramUserId })
    .from(subscribers)
    .where(and(eq(subscribers.isActive, true), gt(subscribers.telegramUserId, job.cursor)))
    .orderBy(asc(subscribers.telegramUserId))
    .limit(BATCH_SIZE);

  const api = tgApi(env);
  let { cursor, delivered, blocked, failed } = job;
  let throttled = false;
  for (const s of batch) {
    try {
      const other = { parse_mode: 'HTML' as const, reply_markup: { inline_keyboard: msg.keyboard } };
      if (msg.photo) await api.sendPhoto(s.id, msg.photo, { ...other, caption: msg.text });
      else await api.sendMessage(s.id, msg.text, other);
      delivered++;
    } catch (e) {
      if (retryAfterSec(e) !== null) {
        throttled = true; // продолжим со следующего запуска с этого же подписчика
        break;
      }
      if (isBlockedError(e)) {
        blocked++;
        await db.update(subscribers).set({ isActive: false, blockedAt: now }).where(eq(subscribers.telegramUserId, s.id));
      } else {
        failed++;
        console.error('broadcast send failed', s.id, e);
      }
    }
    cursor = s.id;
  }

  const finished = !throttled && batch.length < BATCH_SIZE;
  await db
    .update(broadcasts)
    .set({ cursor, delivered, blocked, failed, ...(finished ? { status: 'done' as const, finishedAt: now } : {}) })
    .where(eq(broadcasts.id, job.id));

  if (finished) {
    const lotsStr = lots.map((l) => `№${l.lotNumber}`).join(', ');
    const label = lots.length === 1 ? `по лоту ${lotsStr}` : `по лотам ${lotsStr}`;
    await notifyManagers(
      env,
      db,
      `📣 Рассылка ${label}: доставлено ${delivered}, заблокировали бота ${blocked}${failed ? `, ошибок ${failed}` : ''}`,
    );
  }
}
