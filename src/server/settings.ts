import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db/client';
import { settings } from '../db/schema';

export async function getSetting(db: DB, key: string): Promise<string | null> {
  const [s] = await db.select().from(settings).where(eq(settings.key, key));
  return s?.value ?? null;
}

export async function getSettings(db: DB, keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {};
  const rows = await db.select().from(settings).where(inArray(settings.key, keys));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(db: DB, key: string, value: string): Promise<void> {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function deleteSetting(db: DB, key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}
