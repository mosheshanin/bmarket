import { and, inArray, isNotNull, isNull, lt } from 'drizzle-orm';
import type { DB } from '../db/client';
import { businessPhotos, leads } from '../db/schema';
import { deletePhotos } from './storage';

export const LEAD_RETENTION_MS = 730 * 86_400_000; // 24 месяца
export const PHOTO_PURGE_MS = 30 * 86_400_000;

/** Через 24 месяца имя, телефон, комментарий и Telegram заявки стираются (раздел 12.3). */
export async function anonymizeOldLeads(db: DB, now = Date.now()): Promise<number> {
  const r = await db
    .update(leads)
    .set({ name: null, phone: null, comment: null, telegramUserId: null, telegramUsername: null, ipHash: null, anonymizedAt: now })
    .where(and(lt(leads.createdAt, now - LEAD_RETENTION_MS), isNull(leads.anonymizedAt)))
    .returning({ id: leads.id });
  return r.length;
}

/** Фото, удалённые больше 30 дней назад, стираются из R2 (раздел 12.4). */
export async function purgeDeletedPhotos(env: Env, db: DB, now = Date.now()): Promise<number> {
  const rows = await db
    .select({ id: businessPhotos.id, k1: businessPhotos.r2Key, k2: businessPhotos.r2KeySmall })
    .from(businessPhotos)
    .where(and(isNotNull(businessPhotos.deletedAt), lt(businessPhotos.deletedAt, now - PHOTO_PURGE_MS)))
    .limit(100); // KV: удаление = запись, лимит 1000 в день
  if (!rows.length) return 0;
  await deletePhotos(env, rows.flatMap((r) => [r.k1, r.k2]).filter((k) => !k.startsWith('demo/')));
  await db.delete(businessPhotos).where(inArray(businessPhotos.id, rows.map((r) => r.id)));
  return rows.length;
}
