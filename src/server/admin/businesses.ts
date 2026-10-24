import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../../db/client';
import {
  auditLog, businesses, businessPhotos, categories, cities, events, leads,
  INCLUDED_ITEMS, LEGAL_FORMS, LICENSE_STATES, type Business,
} from '../../db/schema';
import { paybackMonths } from '../../lib/format';
import { EXTRA_KEYS } from '../../lib/extras';
import { businessPath, slugify } from '../../lib/slug';
import { signToken } from '../../lib/crypto';
import { HttpError } from '../http';
import type { AdminContext } from '../auth';
import { purgePaths } from '../cache';
import { queueLotNotification } from '../broadcast';
import { previewSecret } from '../card';
import { imageUrl, isStoredPhotoKey } from '../public';
import { siteUrl } from '../telegram';
import { copyPhoto, putPhoto } from '../storage';
import { notifySellerPublished } from '../seller-notify';

export const FIRST_LOT_NUMBER = 1001;
export const MAX_PHOTOS = 15;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const money = z.number().int().min(0).max(2_000_000_000).nullable();
const smallInt = z.number().int().min(0).max(1_000_000).nullable();
const text = (max: number) => z.string().max(max).nullable();

/** Поля формы объявления. Все необязательны — черновик можно сохранить в любом виде. */
export const BusinessInput = z
  .object({
    publicTitle: z.string().trim().max(80, 'до 80 символов'),
    categoryId: z.number().int().positive().nullable(),
    cityId: z.number().int().positive().nullable(),
    areaNote: text(120),
    priceIls: money,
    priceNegotiable: z.boolean(),
    monthlyRevenueIls: money,
    monthlyProfitIls: money,
    yearFounded: z.number().int().min(1900).max(2100).nullable(),
    employeesCount: smallInt,
    areaSqm: smallInt,
    rentMonthlyIls: money,
    leaseUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'дата ГГГГ-ММ-ДД').nullable(),
    legalForm: z.enum(LEGAL_FORMS).nullable(),
    businessLicense: z.enum(LICENSE_STATES).nullable(),
    includedInSale: z.array(z.enum(INCLUDED_ITEMS)).max(INCLUDED_ITEMS.length),
    ownerSupport: text(300),
    reasonForSale: text(1000),
    shortDescription: z.string().trim().max(200, 'до 200 символов'),
    description: z.string().max(20000),
    videoUrl: z
      .string()
      .trim()
      .regex(/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//, 'нужна ссылка YouTube')
      .nullable()
      .or(z.literal('').transform(() => null)),
    isFeatured: z.boolean(),
    /** Бейджи: время подтверждения оценки / прохождения аудита (null — бейджа нет). */
    valuationVerifiedAt: z.number().int().positive().nullable(),
    auditPassedAt: z.number().int().positive().nullable(),
    extrasOrdered: z.array(z.enum(EXTRA_KEYS)).max(EXTRA_KEYS.length),
    realName: text(200),
    exactAddress: text(300),
    ownerName: text(120),
    ownerPhone: text(40),
    ownerTelegram: text(64),
    internalNotes: text(5000),
  })
  .partial()
  .extend({
    /** Версия формы: если лот изменён другим администратором — 409. */
    expectedUpdatedAt: z.number().int().optional(),
  });
export type BusinessInputT = z.infer<typeof BusinessInput>;

const REQUIRED_FOR_PUBLISH: [keyof Business, string][] = [
  ['publicTitle', 'название'],
  ['cityId', 'город'],
  ['categoryId', 'отрасль'],
  ['priceIls', 'цена'],
  ['shortDescription', 'краткое описание'],
  ['description', 'полное описание'],
];

export async function getBusinessOr404(db: DB, id: number): Promise<Business> {
  const [b] = await db.select().from(businesses).where(eq(businesses.id, id));
  if (!b || b.status === 'deleted') throw new HttpError(404, 'Объявление не найдено');
  return b;
}

/** Журнал изменений; правки одного админа в течение 10 минут склеиваются (автосохранение). */
export async function audit(db: DB, businessId: number, admin: AdminContext, action: (typeof auditLog.$inferInsert)['action'], now = Date.now()) {
  if (action === 'update') {
    const [last] = await db.select().from(auditLog).where(eq(auditLog.businessId, businessId)).orderBy(desc(auditLog.createdAt)).limit(1);
    if (last && last.action === 'update' && last.adminId === admin.id && now - last.createdAt < 10 * 60_000) {
      await db.update(auditLog).set({ createdAt: now }).where(eq(auditLog.id, last.id));
      return;
    }
  }
  await db.insert(auditLog).values({ businessId, adminId: admin.id, adminName: admin.name, action, createdAt: now });
}

async function citySlug(db: DB, id: number | null | undefined): Promise<string | null> {
  if (!id) return null;
  const [c] = await db.select({ slug: cities.slug }).from(cities).where(eq(cities.id, id));
  return c?.slug ?? null;
}

/** Сбросить кеш страниц, где виден лот (до и после изменения). */
export async function purgeForBusiness(env: Env, db: DB, origin: string, before: Business, after?: Business) {
  const paths = new Set<string>(['/', '/sitemap.xml']);
  for (const b of [before, after]) {
    if (!b) continue;
    const p = businessPath(b.lotNumber, b.slug);
    paths.add(p).add(p + '/request').add(`/business/${b.lotNumber}`);
    const cs = await citySlug(db, b.cityId);
    if (cs) paths.add(`/city/${cs}`);
  }
  await purgePaths([origin, siteUrl(env)], [...paths]);
}

function derived(b: Partial<Business>) {
  return {
    slug: slugify(b.publicTitle ?? ''),
    paybackMonths: paybackMonths(b.priceIls, b.monthlyProfitIls),
  };
}

async function nextLotNumber(db: DB): Promise<number> {
  const [r] = await db.select({ m: sql<number | null>`max(${businesses.lotNumber})` }).from(businesses);
  return Math.max(FIRST_LOT_NUMBER, (r?.m ?? FIRST_LOT_NUMBER - 1) + 1);
}

export async function createBusiness(db: DB, admin: AdminContext, input: BusinessInputT, extra: Partial<Pick<Business, 'sellerTgId' | 'sellerStage'>> = {}) {
  const { expectedUpdatedAt: _ignore, ...data } = input;
  const now = Date.now();
  // Два админа одновременно: повтор при конфликте уникального номера лота.
  for (let attempt = 0; attempt < 3; attempt++) {
    const lotNumber = await nextLotNumber(db);
    try {
      const [b] = await db
        .insert(businesses)
        .values({
          ...data,
          ...derived(data),
          ...extra,
          lotNumber,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          createdBy: admin.id,
          updatedBy: admin.id,
        })
        .returning();
      await audit(db, b.id, admin, 'create', now);
      return b;
    } catch (e) {
      if (attempt === 2 || !String(e).includes('UNIQUE')) throw e;
    }
  }
  throw new HttpError(500, 'Не удалось выдать номер лота');
}

export async function updateBusiness(env: Env, db: DB, admin: AdminContext, id: number, input: BusinessInputT, origin: string) {
  const before = await getBusinessOr404(db, id);
  const { expectedUpdatedAt, ...data } = input;
  if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== before.updatedAt) {
    throw new HttpError(409, 'Объявление изменено другим администратором', { current: before });
  }
  const merged = { ...before, ...data };
  const now = Math.max(Date.now(), before.updatedAt + 1);
  const [after] = await db
    .update(businesses)
    .set({ ...data, ...derived(merged), updatedAt: now, updatedBy: admin.id })
    .where(and(eq(businesses.id, id), eq(businesses.updatedAt, before.updatedAt)))
    .returning();
  if (!after) throw new HttpError(409, 'Объявление изменено другим администратором');
  await audit(db, id, admin, 'update', now);
  if (before.status !== 'draft') await purgeForBusiness(env, db, origin, before, after);
  return after;
}

export async function missingForPublish(db: DB, b: Business): Promise<string[]> {
  const missing = REQUIRED_FOR_PUBLISH.filter(([k]) => {
    const v = b[k];
    return v === null || v === undefined || (typeof v === 'string' && !v.trim());
  }).map(([, label]) => label);
  const [p] = await db
    .select({ n: sql<number>`count(*)` })
    .from(businessPhotos)
    .where(and(eq(businessPhotos.businessId, b.id), isNull(businessPhotos.deletedAt)));
  if (!p?.n) missing.push('минимум 1 фото');
  return missing;
}

export async function publishBusiness(env: Env, db: DB, admin: AdminContext, id: number, notify: boolean, origin: string) {
  const before = await getBusinessOr404(db, id);
  const missing = await missingForPublish(db, before);
  if (missing.length) throw new HttpError(422, `Заполните: ${missing.join(', ')}`, { missing });
  const now = Date.now();
  const [after] = await db
    .update(businesses)
    .set({
      status: 'published', publishedAt: before.publishedAt ?? now, updatedAt: Math.max(now, before.updatedAt + 1), updatedBy: admin.id,
      // Объявление продавца после публикации меняется только через запрос администратору.
      ...(before.sellerTgId ? { sellerStage: 'approved' as const } : {}),
    })
    .where(eq(businesses.id, id))
    .returning();
  await audit(db, id, admin, 'publish', now);
  if (before.sellerTgId && before.status === 'draft') await notifySellerPublished(env, after);
  let queued = false;
  // Рассылка — только при первой публикации (notified_at пуст) и включённом переключателе.
  if (notify && !before.notifiedAt) queued = !!(await queueLotNotification(db, id, now));
  await purgeForBusiness(env, db, origin, before, after);
  return { business: after, notificationQueued: queued };
}

export async function hideBusiness(env: Env, db: DB, admin: AdminContext, id: number, origin: string) {
  const before = await getBusinessOr404(db, id);
  if (before.status === 'draft') throw new HttpError(400, 'Черновик не опубликован');
  const now = Date.now();
  const [after] = await db
    .update(businesses)
    .set({ status: 'hidden', updatedAt: Math.max(now, before.updatedAt + 1), updatedBy: admin.id })
    .where(eq(businesses.id, id))
    .returning();
  await audit(db, id, admin, 'hide', now);
  await purgeForBusiness(env, db, origin, before, after);
  return after;
}

/** Удалить можно только черновик; фото стираются из R2 через 30 дней. */
export async function deleteDraft(db: DB, admin: AdminContext, id: number) {
  const b = await getBusinessOr404(db, id);
  if (b.status !== 'draft') throw new HttpError(400, 'Удалять можно только черновики — опубликованные и снятые лоты хранят историю заявок');
  const now = Date.now();
  await db.batch([
    db.update(businessPhotos).set({ deletedAt: now }).where(and(eq(businessPhotos.businessId, id), isNull(businessPhotos.deletedAt))),
    db.update(businesses).set({ status: 'deleted', updatedAt: now, updatedBy: admin.id }).where(eq(businesses.id, id)),
  ]);
  await audit(db, id, admin, 'delete', now);
}

/** Дублировать лот (для похожих объектов): новый черновик с копиями фото. */
export async function duplicateBusiness(env: Env, db: DB, admin: AdminContext, id: number) {
  const src = await getBusinessOr404(db, id);
  const {
    id: _id, lotNumber: _l, status: _s, publishedAt: _p, notifiedAt: _n, createdAt: _c, updatedAt: _u,
    createdBy: _cb, updatedBy: _ub, slug: _slug, paybackMonths: _pb, sellerTgId: _st, sellerStage: _ss, ...fields
  } = src;
  const copy = await createBusiness(db, admin, { ...fields, publicTitle: `${src.publicTitle} (копия)`.slice(0, 80) } as BusinessInputT);
  const photos = await db
    .select()
    .from(businessPhotos)
    .where(and(eq(businessPhotos.businessId, id), isNull(businessPhotos.deletedAt)))
    .orderBy(asc(businessPhotos.sortOrder));
  const now = Date.now();
  for (const p of photos) {
    // Внешние фото (демо, Unsplash) не копируются — ссылка та же.
    const keys = isStoredPhotoKey(p.r2Key) ? photoKeys(copy.lotNumber) : { large: p.r2Key, small: p.r2KeySmall };
    if (isStoredPhotoKey(p.r2Key)) {
      await copyPhoto(env, p.r2Key, keys.large);
      await copyPhoto(env, p.r2KeySmall, keys.small);
    }
    await db.insert(businessPhotos).values({
      businessId: copy.id, r2Key: keys.large, r2KeySmall: keys.small, width: p.width, height: p.height,
      sortOrder: p.sortOrder, alt: p.alt, createdAt: now,
    });
  }
  await audit(db, copy.id, admin, 'duplicate', now);
  return copy;
}

export function photoKeys(lotNumber: number, ext: 'webp' | 'jpg' = 'webp') {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return { large: `lots/${lotNumber}/${id}-1600.${ext}`, small: `lots/${lotNumber}/${id}-600.${ext}` };
}

/** Определить формат по сигнатуре файла: принимаются только WebP и JPEG. */
export function sniffImage(buf: ArrayBuffer): 'webp' | 'jpg' | null {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  return null;
}

export async function addPhoto(env: Env, db: DB, admin: AdminContext, id: number, form: FormData, origin: string) {
  const b = await getBusinessOr404(db, id);
  const large = form.get('large');
  const small = form.get('small');
  const width = Number(form.get('width'));
  const height = Number(form.get('height'));
  if (!(large instanceof File) || !(small instanceof File)) throw new HttpError(400, 'Нужны два файла: large и small');
  if (!(width > 0 && height > 0 && width <= 4000 && height <= 4000)) throw new HttpError(400, 'Неверные размеры фото');
  if (large.size > MAX_PHOTO_BYTES || small.size > MAX_PHOTO_BYTES) throw new HttpError(413, 'Фото больше 2 МБ — сожмите его');
  const [lb, sb] = await Promise.all([large.arrayBuffer(), small.arrayBuffer()]);
  const fmt = sniffImage(lb);
  if (!fmt || sniffImage(sb) !== fmt) throw new HttpError(415, 'Принимаются только сжатые WebP или JPEG');

  const [cnt] = await db
    .select({ n: sql<number>`count(*)`, max: sql<number | null>`max(${businessPhotos.sortOrder})` })
    .from(businessPhotos)
    .where(and(eq(businessPhotos.businessId, id), isNull(businessPhotos.deletedAt)));
  if ((cnt?.n ?? 0) >= MAX_PHOTOS) throw new HttpError(400, `Не больше ${MAX_PHOTOS} фото`);

  const keys = photoKeys(b.lotNumber, fmt);
  const contentType = fmt === 'webp' ? 'image/webp' : 'image/jpeg';
  await Promise.all([putPhoto(env, keys.large, lb, contentType), putPhoto(env, keys.small, sb, contentType)]);
  const alt = String(form.get('alt') ?? '').slice(0, 200) || null;
  const [photo] = await db
    .insert(businessPhotos)
    .values({ businessId: id, r2Key: keys.large, r2KeySmall: keys.small, width, height, sortOrder: (cnt?.max ?? -1) + 1, alt, createdAt: Date.now() })
    .returning();
  await touch(env, db, admin, b, origin);
  return withUrls(env, photo);
}

/** Изменение фото меняет карточку: обновить updated_at, журнал и кеш. */
async function touch(env: Env, db: DB, admin: AdminContext, b: Business, origin: string) {
  const now = Math.max(Date.now(), b.updatedAt + 1);
  const [after] = await db.update(businesses).set({ updatedAt: now, updatedBy: admin.id }).where(eq(businesses.id, b.id)).returning();
  await audit(db, b.id, admin, 'update', now);
  if (b.status !== 'draft') await purgeForBusiness(env, db, origin, b, after);
  return after;
}

export function withUrls(env: Env, p: typeof businessPhotos.$inferSelect) {
  return { ...p, url: imageUrl(env, p.r2Key), urlSmall: imageUrl(env, p.r2KeySmall) };
}

export async function reorderPhotos(env: Env, db: DB, admin: AdminContext, id: number, ids: number[], origin: string) {
  const b = await getBusinessOr404(db, id);
  const own = await db.select({ id: businessPhotos.id }).from(businessPhotos)
    .where(and(eq(businessPhotos.businessId, id), isNull(businessPhotos.deletedAt)));
  const ownSet = new Set(own.map((p) => p.id));
  if (ids.length !== ownSet.size || !ids.every((x) => ownSet.has(x))) throw new HttpError(400, 'Список фото устарел — обновите форму');
  const stmts = ids.map((pid, i) => db.update(businessPhotos).set({ sortOrder: i }).where(eq(businessPhotos.id, pid)));
  if (stmts.length) await db.batch(stmts as [typeof stmts[0], ...typeof stmts]);
  return touch(env, db, admin, b, origin);
}

export async function updatePhoto(env: Env, db: DB, admin: AdminContext, photoId: number, patch: { alt?: string | null; delete?: boolean }, origin: string) {
  const [p] = await db.select().from(businessPhotos).where(and(eq(businessPhotos.id, photoId), isNull(businessPhotos.deletedAt)));
  if (!p) throw new HttpError(404, 'Фото не найдено');
  const b = await getBusinessOr404(db, p.businessId);
  if (patch.delete) {
    const [n] = await db.select({ n: sql<number>`count(*)` }).from(businessPhotos)
      .where(and(eq(businessPhotos.businessId, b.id), isNull(businessPhotos.deletedAt)));
    if (b.status === 'published' && (n?.n ?? 0) <= 1) throw new HttpError(400, 'У опубликованного лота должно остаться хотя бы 1 фото');
    await db.update(businessPhotos).set({ deletedAt: Date.now() }).where(eq(businessPhotos.id, photoId));
  } else {
    await db.update(businessPhotos).set({ alt: patch.alt?.slice(0, 200) || null }).where(eq(businessPhotos.id, photoId));
  }
  return touch(env, db, admin, b, origin);
}

/** Список лотов: просмотры и заявки за 30 дней. */
export async function listBusinesses(env: Env, db: DB, status?: string) {
  const since = Date.now() - 30 * 86_400_000;
  const conds = [ne(businesses.status, 'deleted')];
  if (status === 'seller') {
    conds.push(isNotNull(businesses.sellerTgId));
  } else {
    if (status && ['draft', 'published', 'hidden'].includes(status)) conds.push(eq(businesses.status, status as 'draft'));
    // Черновики, которые продавцы ещё заполняют или не оплатили, — только во вкладке «От продавцов».
    conds.push(sql`not (${businesses.status} = 'draft' and coalesce(${businesses.sellerStage}, '') in ('editing', 'awaiting_payment'))`);
  }
  const rows = await db
    .select({
      id: businesses.id, lotNumber: businesses.lotNumber, slug: businesses.slug, publicTitle: businesses.publicTitle,
      status: businesses.status, cityName: cities.name, isFeatured: businesses.isFeatured, priceIls: businesses.priceIls,
      publishedAt: businesses.publishedAt, updatedAt: businesses.updatedAt, sellerStage: businesses.sellerStage,
      fromSeller: sql<boolean>`${businesses.sellerTgId} is not null`,
    })
    .from(businesses)
    .leftJoin(cities, eq(cities.id, businesses.cityId))
    .where(and(...conds))
    .orderBy(desc(businesses.updatedAt));
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [views, leadCounts, photos] = await Promise.all([
    db.select({ id: events.businessId, n: sql<number>`count(*)` }).from(events)
      .where(and(eq(events.type, 'listing_view'), gt(events.createdAt, since), inArray(events.businessId, ids)))
      .groupBy(events.businessId),
    db.select({ id: leads.businessId, n: sql<number>`count(*)` }).from(leads)
      .where(and(gt(leads.createdAt, since), inArray(leads.businessId, ids)))
      .groupBy(leads.businessId),
    db.select({ businessId: businessPhotos.businessId, key: businessPhotos.r2KeySmall, sort: businessPhotos.sortOrder })
      .from(businessPhotos)
      .where(and(inArray(businessPhotos.businessId, ids), isNull(businessPhotos.deletedAt)))
      .orderBy(asc(businessPhotos.sortOrder)),
  ]);
  const vm = new Map(views.map((v) => [v.id, v.n]));
  const lm = new Map(leadCounts.map((v) => [v.id, v.n]));
  const cover = new Map<number, string>();
  for (const p of photos) if (!cover.has(p.businessId)) cover.set(p.businessId, p.key);
  return rows.map((r) => ({
    ...r,
    path: businessPath(r.lotNumber, r.slug),
    cover: cover.has(r.id) ? imageUrl(env, cover.get(r.id)!) : null,
    views30: vm.get(r.id) ?? 0,
    leads30: lm.get(r.id) ?? 0,
  }));
}

export async function businessDetail(env: Env, db: DB, id: number) {
  const b = await getBusinessOr404(db, id);
  const [photos, log, cat] = await Promise.all([
    db.select().from(businessPhotos).where(and(eq(businessPhotos.businessId, id), isNull(businessPhotos.deletedAt)))
      .orderBy(asc(businessPhotos.sortOrder), asc(businessPhotos.id)),
    db.select().from(auditLog).where(eq(auditLog.businessId, id)).orderBy(desc(auditLog.createdAt)).limit(30),
    b.categoryId ? db.select().from(categories).where(eq(categories.id, b.categoryId)) : Promise.resolve([]),
  ]);
  const token = await signToken(previewSecret(env), `lot:${b.id}`, 3600);
  return {
    business: b,
    photos: photos.map((p) => withUrls(env, p)),
    audit: log,
    categoryName: cat[0]?.name ?? null,
    path: businessPath(b.lotNumber, b.slug),
    previewUrl: `${businessPath(b.lotNumber, b.slug)}?preview=${encodeURIComponent(token)}`,
    missing: await missingForPublish(db, b),
  };
}
