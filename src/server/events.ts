import { and, eq, gt } from 'drizzle-orm';
import type { DB } from '../db/client';
import { events, EVENT_TYPES } from '../db/schema';
import { sha256Hex } from '../lib/crypto';

export type EventType = (typeof EVENT_TYPES)[number];

/** Соль хеша посетителя; задаётся секретом вебхука, чтобы не плодить секреты. */
let salt = 'bmarket';
export function setVisitorSalt(s: string | undefined) {
  if (s) salt = s;
}

/** Обезличенный идентификатор: хеш Telegram ID или случайного ID браузера (без имён, телефонов и IP). */
export async function visitorHash(key: string): Promise<string> {
  return (await sha256Hex(`${salt}:${key}`)).slice(0, 24);
}

export const VIEW_DEDUP_MS = 30 * 60 * 1000;

export async function recordEvent(
  db: DB,
  e: { type: EventType; source: 'mini_app' | 'web'; visitorKey: string; businessId?: number | null },
  now = Date.now(),
): Promise<boolean> {
  const vh = await visitorHash(e.visitorKey);
  if (e.type === 'listing_view' && e.businessId) {
    // Не чаще 1 раза в 30 минут от одного посетителя по одному лоту.
    const [dup] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.visitorHash, vh), eq(events.businessId, e.businessId), eq(events.type, 'listing_view'), gt(events.createdAt, now - VIEW_DEDUP_MS)))
      .limit(1);
    if (dup) return false;
  }
  await db.insert(events).values({ type: e.type, source: e.source, visitorHash: vh, businessId: e.businessId ?? null, createdAt: now });
  return true;
}
