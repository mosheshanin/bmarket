import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../../db/client';
import { businesses, categories, cities } from '../../db/schema';
import { businessPath, slugify } from '../../lib/slug';
import { HttpError } from '../http';
import { purgePaths } from '../cache';
import { siteUrl } from '../telegram';

export const CityInput = z.object({
  name: z.string().trim().min(2).max(60),
  namePrepositional: z.string().trim().min(2).max(60),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'латиница, цифры и дефис').optional(),
});
export const CategoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, 'латиница, цифры и дефис').optional(),
});

export async function listDicts(db: DB) {
  const [cityRows, catRows] = await Promise.all([
    db.select({
      id: cities.id, name: cities.name, namePrepositional: cities.namePrepositional, slug: cities.slug, sortOrder: cities.sortOrder,
      lots: sql<number>`(select count(*) from ${businesses} where ${businesses.cityId} = ${cities.id})`,
    }).from(cities).orderBy(asc(cities.sortOrder), asc(cities.name)),
    db.select({
      id: categories.id, name: categories.name, slug: categories.slug, sortOrder: categories.sortOrder,
      lots: sql<number>`(select count(*) from ${businesses} where ${businesses.categoryId} = ${categories.id})`,
    }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
  ]);
  return { cities: cityRows, categories: catRows };
}

async function nextSort(db: DB, table: typeof cities | typeof categories) {
  const [r] = await db.select({ m: sql<number | null>`max(${table.sortOrder})` }).from(table);
  return (r?.m ?? 0) + 10;
}

function uniqueErr(e: unknown): never {
  if (String(e).includes('UNIQUE')) throw new HttpError(409, 'Такой адрес (slug) уже есть — укажите другой');
  throw e;
}

export async function createCity(db: DB, input: z.infer<typeof CityInput>) {
  const slug = input.slug || slugify(input.name, 40);
  try {
    const [c] = await db.insert(cities).values({ name: input.name, namePrepositional: input.namePrepositional, slug, sortOrder: await nextSort(db, cities) }).returning();
    return c;
  } catch (e) {
    uniqueErr(e);
  }
}

export async function createCategory(db: DB, input: z.infer<typeof CategoryInput>) {
  const slug = input.slug || slugify(input.name, 40);
  try {
    const [c] = await db.insert(categories).values({ name: input.name, slug, sortOrder: await nextSort(db, categories) }).returning();
    return c;
  } catch (e) {
    uniqueErr(e);
  }
}

/** Переименование города меняет заголовки главной, страницы города и карточек — сбросить кеш. */
async function purgeCity(env: Env, db: DB, origin: string, cityId: number | null, categoryId: number | null) {
  const where = cityId ? eq(businesses.cityId, cityId) : eq(businesses.categoryId, categoryId!);
  const lots = await db.select({ lot: businesses.lotNumber, slug: businesses.slug, citySlug: cities.slug })
    .from(businesses).leftJoin(cities, eq(cities.id, businesses.cityId))
    .where(and(where, eq(businesses.status, 'published')));
  const paths = ['/', ...lots.map((l) => businessPath(l.lot, l.slug)), ...lots.map((l) => `/city/${l.citySlug}`)];
  await purgePaths([origin, siteUrl(env)], paths);
}

export async function updateCity(env: Env, db: DB, id: number, input: Partial<z.infer<typeof CityInput>>, origin: string) {
  // slug города не меняется — иначе сломаются проиндексированные адреса.
  const [c] = await db.update(cities).set({ name: input.name, namePrepositional: input.namePrepositional }).where(eq(cities.id, id)).returning();
  if (!c) throw new HttpError(404, 'Город не найден');
  await purgeCity(env, db, origin, id, null);
  return c;
}

export async function updateCategory(env: Env, db: DB, id: number, input: Partial<z.infer<typeof CategoryInput>>, origin: string) {
  const [c] = await db.update(categories).set({ name: input.name }).where(eq(categories.id, id)).returning();
  if (!c) throw new HttpError(404, 'Отрасль не найдена');
  await purgeCity(env, db, origin, null, id);
  return c;
}

/** Удалить можно, только если к записи не привязаны лоты (даже снятые или удалённые черновики). */
export async function deleteDict(db: DB, kind: 'city' | 'category', id: number) {
  const col = kind === 'city' ? businesses.cityId : businesses.categoryId;
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(businesses).where(eq(col, id));
  if ((r?.n ?? 0) > 0) throw new HttpError(409, 'К записи привязаны объявления — её можно только переименовать');
  if (kind === 'city') await db.delete(cities).where(eq(cities.id, id));
  else await db.delete(categories).where(eq(categories.id, id));
}

export async function reorderDict(db: DB, kind: 'city' | 'category', ids: number[]) {
  const table = kind === 'city' ? cities : categories;
  const stmts = ids.map((id, i) => db.update(table).set({ sortOrder: (i + 1) * 10 }).where(eq(table.id, id)));
  if (stmts.length) await db.batch(stmts as [typeof stmts[0], ...typeof stmts]);
}
