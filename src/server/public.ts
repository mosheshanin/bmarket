import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '../db/client';
import { businesses, businessPhotos, categories, cities, exchangeRates } from '../db/schema';

/**
 * ЕДИНСТВЕННЫЙ источник публичных данных о лотах.
 * Поля выбираются по явному списку; скрытые поля (real_name, exact_address, owner_*,
 * internal_notes и служебные) сюда не входят и физически не читаются из базы.
 * Тест tests/hidden-fields.test.ts следит, чтобы так оставалось.
 */
export const PUBLIC_BUSINESS_COLUMNS = {
  id: businesses.id,
  lotNumber: businesses.lotNumber,
  slug: businesses.slug,
  publicTitle: businesses.publicTitle,
  categoryId: businesses.categoryId,
  cityId: businesses.cityId,
  areaNote: businesses.areaNote,
  priceIls: businesses.priceIls,
  priceNegotiable: businesses.priceNegotiable,
  monthlyRevenueIls: businesses.monthlyRevenueIls,
  monthlyProfitIls: businesses.monthlyProfitIls,
  paybackMonths: businesses.paybackMonths,
  yearFounded: businesses.yearFounded,
  employeesCount: businesses.employeesCount,
  areaSqm: businesses.areaSqm,
  rentMonthlyIls: businesses.rentMonthlyIls,
  leaseUntil: businesses.leaseUntil,
  legalForm: businesses.legalForm,
  businessLicense: businesses.businessLicense,
  includedInSale: businesses.includedInSale,
  ownerSupport: businesses.ownerSupport,
  reasonForSale: businesses.reasonForSale,
  shortDescription: businesses.shortDescription,
  description: businesses.description,
  videoUrl: businesses.videoUrl,
  isFeatured: businesses.isFeatured,
  valuationVerifiedAt: businesses.valuationVerifiedAt,
  auditPassedAt: businesses.auditPassedAt,
  publishedAt: businesses.publishedAt,
  updatedAt: businesses.updatedAt,
  /** Нужен серверу для ответа 410; посетителю не выводится. */
  status: businesses.status,
} as const;

/** Поля, которые запрещено отдавать посетителям (проверяются тестом). */
export const HIDDEN_BUSINESS_FIELDS = [
  'realName', 'exactAddress', 'ownerName', 'ownerPhone', 'ownerTelegram', 'internalNotes',
  'createdBy', 'updatedBy', 'notifiedAt', 'createdAt', 'sellerTgId', 'sellerStage', 'extrasOrdered',
] as const;

export interface PublicPhoto {
  id: number;
  r2Key: string;
  r2KeySmall: string;
  width: number;
  height: number;
  alt: string | null;
}

export interface PublicListing {
  id: number;
  lotNumber: number;
  slug: string;
  publicTitle: string;
  categoryId: number | null;
  cityId: number | null;
  cityName: string | null;
  cityPrepositional: string | null;
  citySlug: string | null;
  categoryName: string | null;
  priceIls: number | null;
  priceNegotiable: boolean;
  monthlyProfitIls: number | null;
  paybackMonths: number | null;
  shortDescription: string;
  isFeatured: boolean;
  valuationVerifiedAt: number | null;
  auditPassedAt: number | null;
  publishedAt: number | null;
  updatedAt: number;
  cover: PublicPhoto | null;
}

const listColumns = {
  id: businesses.id,
  lotNumber: businesses.lotNumber,
  slug: businesses.slug,
  publicTitle: businesses.publicTitle,
  categoryId: businesses.categoryId,
  cityId: businesses.cityId,
  cityName: cities.name,
  cityPrepositional: cities.namePrepositional,
  citySlug: cities.slug,
  categoryName: categories.name,
  priceIls: businesses.priceIls,
  priceNegotiable: businesses.priceNegotiable,
  monthlyProfitIls: businesses.monthlyProfitIls,
  paybackMonths: businesses.paybackMonths,
  shortDescription: businesses.shortDescription,
  isFeatured: businesses.isFeatured,
  valuationVerifiedAt: businesses.valuationVerifiedAt,
  auditPassedAt: businesses.auditPassedAt,
  publishedAt: businesses.publishedAt,
  updatedAt: businesses.updatedAt,
};

const photoColumns = {
  id: businessPhotos.id,
  businessId: businessPhotos.businessId,
  r2Key: businessPhotos.r2Key,
  r2KeySmall: businessPhotos.r2KeySmall,
  width: businessPhotos.width,
  height: businessPhotos.height,
  alt: businessPhotos.alt,
  sortOrder: businessPhotos.sortOrder,
};

export async function photosFor(db: DB, ids: number[]) {
  if (!ids.length) return [];
  return db
    .select(photoColumns)
    .from(businessPhotos)
    .where(and(inArray(businessPhotos.businessId, ids), isNull(businessPhotos.deletedAt)))
    .orderBy(asc(businessPhotos.businessId), asc(businessPhotos.sortOrder), asc(businessPhotos.id));
}

/** Опубликованные лоты: сначала закреплённые, затем новые сверху. */
export async function listPublished(db: DB, opts: { cityId?: number; excludeId?: number; limit?: number } = {}): Promise<PublicListing[]> {
  const conds = [eq(businesses.status, 'published')];
  if (opts.cityId) conds.push(eq(businesses.cityId, opts.cityId));
  if (opts.excludeId) conds.push(sql`${businesses.id} <> ${opts.excludeId}`);
  let q = db
    .select(listColumns)
    .from(businesses)
    .leftJoin(cities, eq(cities.id, businesses.cityId))
    .leftJoin(categories, eq(categories.id, businesses.categoryId))
    .where(and(...conds))
    .orderBy(desc(businesses.isFeatured), desc(businesses.publishedAt))
    .$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  const rows = await q;
  const photos = await photosFor(db, rows.map((r) => r.id));
  const cover = new Map<number, PublicPhoto>();
  for (const p of photos) if (!cover.has(p.businessId)) cover.set(p.businessId, p);
  return rows.map((r) => ({ ...r, cover: cover.get(r.id) ?? null }));
}

export interface CityWithCount {
  id: number;
  name: string;
  namePrepositional: string;
  slug: string;
  count: number;
}

/** Лента городов: только города с опубликованными лотами. */
export async function citiesWithListings(db: DB): Promise<CityWithCount[]> {
  return db
    .select({
      id: cities.id,
      name: cities.name,
      namePrepositional: cities.namePrepositional,
      slug: cities.slug,
      count: sql<number>`count(${businesses.id})`.as('count'),
    })
    .from(cities)
    .innerJoin(businesses, and(eq(businesses.cityId, cities.id), eq(businesses.status, 'published')))
    .where(eq(cities.isActive, true))
    .groupBy(cities.id)
    .orderBy(asc(cities.sortOrder), asc(cities.name));
}

export async function getCityBySlug(db: DB, slug: string) {
  const [c] = await db.select().from(cities).where(and(eq(cities.slug, slug), eq(cities.isActive, true))).limit(1);
  return c ?? null;
}

/** Карточка лота по номеру — только публичные поля. Статус проверяет вызывающий код. */
export async function getPublicBusinessByLot(db: DB, lotNumber: number) {
  const [row] = await db
    .select({
      ...PUBLIC_BUSINESS_COLUMNS,
      cityName: cities.name,
      cityPrepositional: cities.namePrepositional,
      citySlug: cities.slug,
      categoryName: categories.name,
    })
    .from(businesses)
    .leftJoin(cities, eq(cities.id, businesses.cityId))
    .leftJoin(categories, eq(categories.id, businesses.categoryId))
    .where(eq(businesses.lotNumber, lotNumber))
    .limit(1);
  if (!row) return null;
  const photos = await photosFor(db, [row.id]);
  return { ...row, photos };
}

export type PublicBusiness = NonNullable<Awaited<ReturnType<typeof getPublicBusinessByLot>>>;

export interface DisplayRate {
  date: string;
  usdIls: number;
  eurIls: number;
}

export const RATE_MAX_AGE_DAYS = 7;

/** Последний курс; если он старше 7 дней — null (суммы в USD/EUR скрываются). */
export async function getDisplayRate(db: DB, now = Date.now()): Promise<DisplayRate | null> {
  const [r] = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)).limit(1);
  if (!r) return null;
  const age = (now - Date.parse(r.date + 'T00:00:00Z')) / 86_400_000;
  if (age > RATE_MAX_AGE_DAYS) return null;
  return { date: r.date, usdIls: r.usdIls, eurIls: r.eurIls };
}

/** Сводка для заставки: сколько опубликовано и минимальная цена. */
export async function catalogSummary(db: DB): Promise<{ count: number; minPrice: number | null }> {
  const [r] = await db
    .select({ count: sql<number>`count(*)`, minPrice: sql<number | null>`min(${businesses.priceIls})` })
    .from(businesses)
    .where(eq(businesses.status, 'published'));
  return { count: r?.count ?? 0, minPrice: r?.minPrice ?? null };
}

export async function sitemapEntries(db: DB) {
  const lots = await db
    .select({ lotNumber: businesses.lotNumber, slug: businesses.slug, updatedAt: businesses.updatedAt })
    .from(businesses)
    .where(eq(businesses.status, 'published'))
    .orderBy(desc(businesses.publishedAt));
  const cityRows = await citiesWithListings(db);
  return { lots, cities: cityRows };
}

export const NEW_BADGE_DAYS = 7;
export function isNew(publishedAt: number | null, now = Date.now()): boolean {
  return !!publishedAt && now - publishedAt < NEW_BADGE_DAYS * 86_400_000;
}

/**
 * Фото, которые лежат не в нашем хранилище:
 * `demo/…` — статика приложения; `unsplash:<id>:<ширина>` — фото Unsplash (бесплатная лицензия),
 * отдаются с их CDN в нужном размере (4:3). Такие ключи нельзя удалять или копировать в хранилище.
 */
export function isStoredPhotoKey(key: string): boolean {
  return !key.startsWith('demo/') && !key.startsWith('unsplash:');
}

export function imageUrl(env: { PUBLIC_IMAGES_URL?: string }, key: string): string {
  if (key.startsWith('demo/')) return `/${key}`;
  const u = /^unsplash:([\w-]+):(\d+)$/.exec(key);
  if (u) {
    const w = Number(u[2]);
    return `https://images.unsplash.com/photo-${u[1]}?w=${w}&h=${Math.round((w * 3) / 4)}&fit=crop&crop=entropy&auto=format&q=75`;
  }
  const base = (env.PUBLIC_IMAGES_URL || '').replace(/\/$/, '');
  return base ? `${base}/${key}` : `/img/${key}`;
}
