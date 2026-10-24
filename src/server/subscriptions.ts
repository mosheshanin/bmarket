import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { subscribers } from '../db/schema';
import type { TgUser } from '../lib/telegram-auth';
import { recordEvent } from './events';

export async function subscribe(db: DB, user: TgUser, source: 'mini_app' | 'web' = 'mini_app'): Promise<boolean> {
  const now = Date.now();
  const [existing] = await db.select().from(subscribers).where(eq(subscribers.telegramUserId, user.id));
  if (existing?.isActive) return false;
  await db
    .insert(subscribers)
    .values({ telegramUserId: user.id, firstName: user.first_name ?? null, username: user.username ?? null, isActive: true, subscribedAt: now })
    .onConflictDoUpdate({
      target: subscribers.telegramUserId,
      set: { isActive: true, subscribedAt: now, unsubscribedAt: null, blockedAt: null, firstName: user.first_name ?? null, username: user.username ?? null },
    });
  await recordEvent(db, { type: 'subscribe', source, visitorKey: `tg:${user.id}` });
  return true;
}

export async function unsubscribe(db: DB, userId: number, source: 'mini_app' | 'web' = 'mini_app'): Promise<boolean> {
  const r = await db
    .update(subscribers)
    .set({ isActive: false, unsubscribedAt: Date.now() })
    .where(eq(subscribers.telegramUserId, userId))
    .returning({ id: subscribers.telegramUserId });
  if (r.length) await recordEvent(db, { type: 'unsubscribe', source, visitorKey: `tg:${userId}` });
  return r.length > 0;
}

export async function isSubscribed(db: DB, userId: number): Promise<boolean> {
  const [s] = await db.select({ a: subscribers.isActive }).from(subscribers).where(eq(subscribers.telegramUserId, userId));
  return !!s?.a;
}
