import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { businesses, businessPhotos, categories, cities, editRequests, payments, type Business, type Payment } from '../db/schema';
import { imageUrl } from './public';
import { ITEM_LABELS, extraByKey, extraPrice, orderTotal, type Prices } from '../lib/extras';
import { escapeHtml, formatIls } from '../lib/format';
import { businessPath } from '../lib/slug';
import type { TgUser } from '../lib/telegram-auth';
import { displayName, type AdminContext } from './auth';
import { HttpError } from './http';
import {
  BusinessInput, addPhoto, audit, createBusiness, deleteDraft, getBusinessOr404, missingForPublish, publishBusiness,
  reorderPhotos, updateBusiness, updatePhoto, withUrls,
} from './admin/businesses';
import { captureOrder, createOrder, getOrder, orderOutcome, paypalConfigured, paypalMode, type PayPalOrder } from './paypal';
import { notifySeller } from './seller-notify';
import { getSettings, setSetting } from './settings';
import { miniAppLink, notifyManagers, siteUrl } from './telegram';

/**
 * Объявления, которые продавцы подают сами (страница /sell в мини-приложении).
 * Жизненный цикл: editing (черновик, автосохранение) → awaiting_payment → оплата PayPal →
 * автопубликация (approved) или проверка администратором (in_review → approved).
 * После оплаты продавец больше не редактирует объявление — только отправляет запрос администратору.
 */

export const MAX_OPEN_DRAFTS = 3;
export const EDIT_REQUESTS_PER_DAY = 5;

/** Поля, которые продавец заполняет сам: всё, кроме служебных («закрепить», внутренние заметки). */
export const SellerInput = BusinessInput
  .omit({ isFeatured: true, internalNotes: true, valuationVerifiedAt: true, auditPassedAt: true });
export type SellerInputT = z.infer<typeof SellerInput>;

export const EditRequestInput = z.object({ text: z.string().trim().min(5, 'опишите, что изменить').max(2000) });

// ---------- Настройки размещения ----------

export interface SellerSettings extends Prices {
  /** priceIls — цена размещения в шекелях (0 — бесплатно); valuation/audit — цены услуг. */
  /** true — публиковать сразу после оплаты; false — после проверки администратором. */
  autoPublish: boolean;
}
const PRICE_KEY = 'seller_price_ils';
const VALUATION_KEY = 'seller_price_valuation';
const AUDIT_KEY = 'seller_price_audit';
const AUTO_KEY = 'seller_auto_publish';
export const DEFAULT_SELLER_PRICE = 199;

function money(v: string | undefined, def: number): number {
  const n = v === undefined ? def : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : def;
}

export async function getSellerSettings(db: DB): Promise<SellerSettings> {
  const s = await getSettings(db, [PRICE_KEY, VALUATION_KEY, AUDIT_KEY, AUTO_KEY]);
  return {
    priceIls: money(s[PRICE_KEY], DEFAULT_SELLER_PRICE),
    valuationPriceIls: money(s[VALUATION_KEY], extraByKey('valuation')!.defaultPrice),
    auditPriceIls: money(s[AUDIT_KEY], extraByKey('audit')!.defaultPrice),
    autoPublish: s[AUTO_KEY] !== '0',
  };
}

const price = z.number().int().min(0).max(100_000).optional();
export const SellerSettingsInput = z.object({
  priceIls: price,
  valuationPriceIls: price,
  auditPriceIls: price,
  autoPublish: z.boolean().optional(),
});

export async function saveSellerSettings(db: DB, input: z.infer<typeof SellerSettingsInput>): Promise<SellerSettings> {
  if (input.priceIls !== undefined) await setSetting(db, PRICE_KEY, String(input.priceIls));
  if (input.valuationPriceIls !== undefined) await setSetting(db, VALUATION_KEY, String(input.valuationPriceIls));
  if (input.auditPriceIls !== undefined) await setSetting(db, AUDIT_KEY, String(input.auditPriceIls));
  if (input.autoPublish !== undefined) await setSetting(db, AUTO_KEY, input.autoPublish ? '1' : '0');
  return getSellerSettings(db);
}

/**
 * Онлайн-оплата (PayPal) выключена решением владельца (переменная ONLINE_PAYMENTS = "0" в wrangler.jsonc):
 * продавец отправляет заявку на размещение, менеджеры получают её в группе с суммой, согласуют оплату сами
 * и отмечают её в админке. Включить: ONLINE_PAYMENTS = "1" + секреты PayPal (docs/PAYMENTS.md).
 */
export function onlinePayments(env: Env): boolean {
  return String(env.ONLINE_PAYMENTS ?? '0') === '1' && paypalConfigured(env);
}

export function paymentInfo(env: Env) {
  return { paypal: onlinePayments(env), mode: paypalMode(env), webhook: !!env.PAYPAL_WEBHOOK_ID };
}

// ---------- Доступ ----------

function sellerCtx(user: TgUser): AdminContext {
  return { id: user.id, name: `Продавец ${displayName(user)}`, user };
}

const SYSTEM: AdminContext = { id: 0, name: 'Автопубликация', user: { id: 0, first_name: 'Автопубликация' } as TgUser };

async function getOwn(db: DB, user: TgUser, id: number): Promise<Business> {
  const [b] = await db.select().from(businesses).where(and(eq(businesses.id, id), eq(businesses.sellerTgId, user.id)));
  if (!b || b.status === 'deleted') throw new HttpError(404, 'Объявление не найдено');
  return b;
}

/** Черновик продавца можно менять только до отправки на оплату. */
async function getEditable(db: DB, user: TgUser, id: number): Promise<Business> {
  const b = await getOwn(db, user, id);
  if (b.status !== 'draft' || b.sellerStage !== 'editing') {
    throw new HttpError(409, 'Объявление уже отправлено — изменения вносит администратор по вашему запросу');
  }
  return b;
}

async function completedPayment(db: DB, businessId: number): Promise<Payment | null> {
  const [p] = await db.select().from(payments)
    .where(and(eq(payments.businessId, businessId), eq(payments.status, 'completed')))
    .orderBy(desc(payments.completedAt)).limit(1);
  return p ?? null;
}

/** Чего не хватает для отправки: как для публикации + телефон продавца. */
async function sellerMissing(db: DB, b: Business): Promise<string[]> {
  const missing = await missingForPublish(db, b);
  if (!b.ownerPhone?.trim()) missing.push('ваш телефон');
  return missing;
}

// ---------- Чтение ----------

const OWN_FIELDS = [
  'id', 'lotNumber', 'slug', 'publicTitle', 'categoryId', 'cityId', 'areaNote', 'priceIls', 'priceNegotiable',
  'monthlyRevenueIls', 'monthlyProfitIls', 'paybackMonths', 'yearFounded', 'employeesCount', 'areaSqm', 'rentMonthlyIls',
  'leaseUntil', 'legalForm', 'businessLicense', 'includedInSale', 'ownerSupport', 'reasonForSale', 'shortDescription',
  'description', 'videoUrl', 'status', 'publishedAt', 'realName', 'exactAddress', 'ownerName', 'ownerPhone', 'ownerTelegram',
  'sellerStage', 'extrasOrdered', 'valuationVerifiedAt', 'auditPassedAt', 'createdAt', 'updatedAt',
] as const;

/** Данные своего объявления для продавца (без внутренних заметок администратора). */
function ownView(b: Business) {
  const out: Record<string, unknown> = {};
  for (const k of OWN_FIELDS) out[k] = b[k];
  return out as Pick<Business, (typeof OWN_FIELDS)[number]>;
}

export async function listOwn(env: Env, db: DB, user: TgUser) {
  const rows = await db
    .select({
      id: businesses.id, lotNumber: businesses.lotNumber, slug: businesses.slug, publicTitle: businesses.publicTitle,
      status: businesses.status, sellerStage: businesses.sellerStage, priceIls: businesses.priceIls,
      cityName: cities.name, updatedAt: businesses.updatedAt, publishedAt: businesses.publishedAt,
    })
    .from(businesses)
    .leftJoin(cities, eq(cities.id, businesses.cityId))
    .where(and(eq(businesses.sellerTgId, user.id), ne(businesses.status, 'deleted')))
    .orderBy(desc(businesses.updatedAt));
  const ids = rows.map((r) => r.id);
  const covers = ids.length
    ? await db.select({ businessId: businessPhotos.businessId, key: businessPhotos.r2KeySmall }).from(businessPhotos)
      .where(and(inArray(businessPhotos.businessId, ids), isNull(businessPhotos.deletedAt))).orderBy(asc(businessPhotos.sortOrder))
    : [];
  const cover = new Map<number, string>();
  for (const c of covers) if (!cover.has(c.businessId)) cover.set(c.businessId, c.key);
  return rows.map((r) => ({
    ...r,
    path: businessPath(r.lotNumber, r.slug),
    cover: cover.has(r.id) ? imageUrl(env, cover.get(r.id)!) : null,
  }));
}

export async function sellerDetail(env: Env, db: DB, b: Business) {
  const [photos, pays, reqs, settings] = await Promise.all([
    db.select().from(businessPhotos).where(and(eq(businessPhotos.businessId, b.id), isNull(businessPhotos.deletedAt)))
      .orderBy(asc(businessPhotos.sortOrder), asc(businessPhotos.id)),
    db.select({ status: payments.status, amount: payments.amount, currency: payments.currency, provider: payments.provider, createdAt: payments.createdAt, completedAt: payments.completedAt })
      .from(payments).where(eq(payments.businessId, b.id)).orderBy(desc(payments.createdAt)).limit(5),
    db.select({ id: editRequests.id, text: editRequests.text, status: editRequests.status, adminNote: editRequests.adminNote, createdAt: editRequests.createdAt, handledAt: editRequests.handledAt })
      .from(editRequests).where(eq(editRequests.businessId, b.id)).orderBy(desc(editRequests.createdAt)).limit(20),
    getSellerSettings(db),
  ]);
  return {
    business: ownView(b),
    photos: photos.map((p) => withUrls(env, p)),
    missing: await sellerMissing(db, b),
    path: businessPath(b.lotNumber, b.slug),
    paid: pays.some((p) => p.status === 'completed'),
    paymentPending: pays.some((p) => p.status === 'pending'),
    payments: pays,
    editRequests: reqs,
    priceIls: settings.priceIls,
    valuationPriceIls: settings.valuationPriceIls,
    auditPriceIls: settings.auditPriceIls,
    total: orderTotal(settings, b.extrasOrdered ?? []).totalIls,
    autoPublish: settings.autoPublish,
    payment: paymentInfo(env),
  };
}

export async function ownDetail(env: Env, db: DB, user: TgUser, id: number) {
  return sellerDetail(env, db, await getOwn(db, user, id));
}

// ---------- Черновик ----------

export const DraftPrefill = z.object({
  categoryId: z.number().int().positive().optional(),
  cityId: z.number().int().positive().optional(),
});

/** prefill — сфера и город из опроса при первом запуске. */
export async function createSellerDraft(env: Env, db: DB, user: TgUser, prefill: z.infer<typeof DraftPrefill> = {}) {
  const [open] = await db.select({ n: sql<number>`count(*)` }).from(businesses)
    .where(and(eq(businesses.sellerTgId, user.id), eq(businesses.status, 'draft'), inArray(businesses.sellerStage, ['editing', 'awaiting_payment'])));
  if ((open?.n ?? 0) >= MAX_OPEN_DRAFTS) {
    throw new HttpError(429, `У вас уже ${MAX_OPEN_DRAFTS} неотправленных черновика — завершите или удалите один из них`);
  }
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const [cat] = prefill.categoryId ? await db.select({ id: categories.id }).from(categories).where(eq(categories.id, prefill.categoryId)) : [];
  const [city] = prefill.cityId ? await db.select({ id: cities.id }).from(cities).where(eq(cities.id, prefill.cityId)) : [];
  const b = await createBusiness(
    db,
    sellerCtx(user),
    { ownerName: name, ownerTelegram: user.username ? '@' + user.username : null, categoryId: cat?.id ?? null, cityId: city?.id ?? null },
    { sellerTgId: user.id, sellerStage: 'editing' },
  );
  return sellerDetail(env, db, b);
}

export async function updateSellerDraft(env: Env, db: DB, user: TgUser, id: number, input: SellerInputT, origin: string) {
  await getEditable(db, user, id);
  // После оплаты состав заказанных услуг не меняется (добавить услугу — через запрос администратору).
  if (input.extrasOrdered && (await completedPayment(db, id))) delete input.extrasOrdered;
  const after = await updateBusiness(env, db, sellerCtx(user), id, input, origin);
  return sellerDetail(env, db, after);
}

export async function deleteSellerDraft(db: DB, user: TgUser, id: number) {
  const b = await getOwn(db, user, id);
  if (b.status !== 'draft' || !['editing', 'awaiting_payment'].includes(b.sellerStage ?? '') || (await completedPayment(db, id))) {
    throw new HttpError(409, 'Оплаченное объявление удалить нельзя — напишите администратору через «Запросить изменения»');
  }
  await deleteDraft(db, sellerCtx(user), id);
}

export async function sellerAddPhoto(env: Env, db: DB, user: TgUser, id: number, form: FormData, origin: string) {
  await getEditable(db, user, id);
  return addPhoto(env, db, sellerCtx(user), id, form, origin);
}

export async function sellerReorderPhotos(env: Env, db: DB, user: TgUser, id: number, ids: number[], origin: string) {
  await getEditable(db, user, id);
  await reorderPhotos(env, db, sellerCtx(user), id, ids, origin);
  return ownDetail(env, db, user, id);
}

export async function sellerUpdatePhoto(env: Env, db: DB, user: TgUser, photoId: number, patch: { alt?: string | null; delete?: boolean }, origin: string) {
  const [p] = await db.select({ businessId: businessPhotos.businessId }).from(businessPhotos)
    .where(and(eq(businessPhotos.id, photoId), isNull(businessPhotos.deletedAt)));
  if (!p) throw new HttpError(404, 'Фото не найдено');
  await getEditable(db, user, p.businessId);
  await updatePhoto(env, db, sellerCtx(user), photoId, patch, origin);
  return ownDetail(env, db, user, p.businessId);
}

// ---------- Отправка и оплата ----------

export async function submitSellerDraft(env: Env, db: DB, user: TgUser, id: number) {
  const b = await getEditable(db, user, id);
  const missing = await sellerMissing(db, b);
  if (missing.length) throw new HttpError(422, `Заполните: ${missing.join(', ')}`, { missing });
  const { totalIls } = orderTotal(await getSellerSettings(db), b.extrasOrdered ?? []);
  // Уже оплачено (администратор вернул на доработку) или платить не за что — сразу дальше.
  if ((await completedPayment(db, id)) || totalIls === 0) {
    await afterPayment(env, db, id, null);
  } else {
    await setStage(db, id, 'awaiting_payment');
    if (!onlinePayments(env)) await notifyManagers(env, db, await placementRequestHtml(env, db, user, b));
  }
  return ownDetail(env, db, user, id);
}

/**
 * Заявка на размещение для группы менеджеров: что размещается, услуги, сумма, как связаться.
 * Скрытые поля лота (телефон, реальное название, адрес) сюда не попадают — они в админке.
 */
export async function placementRequestHtml(env: Env, db: DB, user: TgUser, b: Business): Promise<string> {
  const settings = await getSellerSettings(db);
  const { totalIls } = orderTotal(settings, b.extrasOrdered ?? []);
  const [names] = await db.select({ city: cities.name, category: categories.name }).from(businesses)
    .leftJoin(cities, eq(cities.id, businesses.cityId)).leftJoin(categories, eq(categories.id, businesses.categoryId))
    .where(eq(businesses.id, b.id));
  const e = escapeHtml;
  const who = user.username ? `@${e(user.username)}` : `<a href="tg://user?id=${user.id}">${e([user.first_name, user.last_name].filter(Boolean).join(' ') || 'профиль')}</a>`;
  const lines = [
    `🧾 <b>Заявка на размещение объявления №${b.lotNumber}</b>`,
    `«${e(b.publicTitle)}»`,
    [names?.category, names?.city].filter(Boolean).map((x) => e(x!)).join(' · ') + (b.priceIls ? ` · цена бизнеса ${formatIls(b.priceIls)}` : ''),
    '',
    `Продавец: ${who} (контакты и скрытые данные — в админке)`,
    '',
    '<b>К оплате:</b>',
  ];
  if (settings.priceIls > 0) lines.push(`• Размещение — ${formatIls(settings.priceIls)}`);
  for (const k of b.extrasOrdered ?? []) {
    const x = extraByKey(k);
    if (x) lines.push(`• ${e(x.title)} — ${formatIls(extraPrice(settings, k))}`);
  }
  lines.push(`<b>Итого: ${formatIls(totalIls)}</b>`, '', 'Свяжитесь с продавцом, согласуйте оплату и нажмите «Отметить оплату вручную» в карточке лота.');
  return lines.join('\n') + adminLinkHtml(env, b.id);
}

export async function backToEditing(env: Env, db: DB, user: TgUser, id: number) {
  const b = await getOwn(db, user, id);
  if (b.status !== 'draft' || b.sellerStage !== 'awaiting_payment') throw new HttpError(409, 'Объявление нельзя вернуть в черновик');
  await setStage(db, id, 'editing');
  return ownDetail(env, db, user, id);
}

async function setStage(db: DB, id: number, stage: Business['sellerStage']) {
  await db.update(businesses).set({ sellerStage: stage, updatedAt: sql`max(${Date.now()}, ${businesses.updatedAt} + 1)` }).where(eq(businesses.id, id));
}

export async function startPayPal(env: Env, db: DB, user: TgUser, id: number) {
  const b = await getOwn(db, user, id);
  if (b.status !== 'draft' || b.sellerStage !== 'awaiting_payment') throw new HttpError(409, 'Сначала отправьте объявление');
  if (await completedPayment(db, id)) throw new HttpError(409, 'Объявление уже оплачено');
  if (!onlinePayments(env)) throw new HttpError(503, 'Онлайн-оплата не подключена — менеджер свяжется с вами, чтобы согласовать оплату');
  const { items, totalIls } = orderTotal(await getSellerSettings(db), b.extrasOrdered ?? []);
  if (totalIls === 0) throw new HttpError(409, 'Оплата не нужна');
  const site = siteUrl(env);
  const amount = totalIls * 100;
  const order = await createOrder(env, {
    amount, currency: 'ILS', businessId: id, lotNumber: b.lotNumber, brand: env.PROJECT_NAME || 'BMarket',
    description: `Объявление №${b.lotNumber}: ${items.map((i) => ITEM_LABELS[i]).join(', ')}`,
    returnUrl: `${site}/pay/paypal/return`, cancelUrl: `${site}/pay/paypal/cancel?b=${id}`,
  });
  const now = Date.now();
  await db.insert(payments).values({
    businessId: id, tgUserId: user.id, provider: 'paypal', providerOrderId: order.id, status: 'created',
    amount, currency: 'ILS', items, createdAt: now, updatedAt: now,
  });
  return { approveUrl: order.approveUrl, orderId: order.id };
}

/**
 * Довести заказ PayPal до конца: одобрен → списать; списан → отметить оплату и опубликовать.
 * Вызывается со страницы возврата, из вебхука и из сверки по расписанию — повторы безопасны.
 */
export async function settlePayPalOrder(env: Env, db: DB, orderId: string, known?: PayPalOrder): Promise<{ state: string; businessId?: number }> {
  const [pay] = await db.select().from(payments).where(eq(payments.providerOrderId, orderId));
  if (!pay) return { state: 'unknown' };
  if (pay.status === 'completed') return { state: 'completed', businessId: pay.businessId };
  let order = known ?? (await getOrder(env, orderId));
  let out = orderOutcome(order);
  if (out.state === 'approved') {
    order = await captureOrder(env, orderId);
    out = orderOutcome(order);
  }
  const now = Date.now();
  if (out.state === 'completed') {
    if (out.amount !== pay.amount || out.currency !== pay.currency) {
      await db.update(payments).set({ status: 'failed', captureId: out.captureId, note: `сумма не совпала: ${out.amount} ${out.currency}`, updatedAt: now }).where(eq(payments.id, pay.id));
      await notifyManagers(env, db, `⚠️ PayPal: сумма заказа ${orderId} не совпала с ценой размещения. Проверьте платёж вручную.${adminLinkHtml(env, pay.businessId)}`);
      return { state: 'failed', businessId: pay.businessId };
    }
    // Условное обновление: только один из параллельных вызовов публикует объявление.
    const won = await db.update(payments)
      .set({ status: 'completed', captureId: out.captureId, completedAt: now, updatedAt: now, checkedAt: now })
      .where(and(eq(payments.id, pay.id), ne(payments.status, 'completed')))
      .returning({ id: payments.id });
    if (won.length) await afterPayment(env, db, pay.businessId, { ...pay, status: 'completed' });
    return { state: 'completed', businessId: pay.businessId };
  }
  if (out.state === 'pending' || out.state === 'failed') {
    await db.update(payments).set({ status: out.state, captureId: out.captureId ?? pay.captureId, updatedAt: now, checkedAt: now }).where(eq(payments.id, pay.id));
  } else {
    await db.update(payments).set({ checkedAt: now }).where(eq(payments.id, pay.id));
  }
  return { state: out.state, businessId: pay.businessId };
}

/** Деньги получены (или размещение бесплатное): автопубликация или очередь на проверку. */
async function afterPayment(env: Env, db: DB, businessId: number, pay: Payment | null) {
  const b = await getBusinessOr404(db, businessId);
  if (b.status !== 'draft') return;
  const { autoPublish } = await getSellerSettings(db);
  const missing = await missingForPublish(db, b);
  const amount = pay ? ` · ${formatIls(pay.amount / 100)} (${pay.provider === 'paypal' ? 'PayPal' : 'вручную'})` : '';
  const settings = await getSellerSettings(db);
  const extras = (b.extrasOrdered ?? []).map((k) => `${extraByKey(k)?.title ?? k} (${formatIls(extraPrice(settings, k))})`);
  const head = `Лот №${b.lotNumber} «${escapeHtml(b.publicTitle)}»${amount}` +
    (extras.length ? `\n🧾 Заказаны услуги: ${escapeHtml(extras.join(', '))} — выполните и отметьте бейдж в карточке лота` : '');
  if (autoPublish && !missing.length) {
    // publishBusiness сам переводит этап в approved и пишет продавцу.
    await publishBusiness(env, db, SYSTEM, businessId, true, siteUrl(env));
    await notifyManagers(env, db, `💳 Оплачено и опубликовано автоматически: ${head}${adminLinkHtml(env, businessId)}`);
    return;
  }
  await setStage(db, businessId, 'in_review');
  await notifyManagers(env, db, `💳 Новое объявление от продавца ждёт проверки: ${head}${adminLinkHtml(env, businessId)}`);
  await notifySeller(env, b.sellerTgId, `Спасибо! ${pay ? 'Оплата получена. ' : ''}Объявление №${b.lotNumber} отправлено на проверку — после публикации пришлём сообщение.`, {
    text: 'Мои объявления', path: `/sell?b=${businessId}`,
  });
}

function adminLinkHtml(env: Env, businessId: number): string {
  const link = miniAppLink(env, `biz-${businessId}`) ?? `${siteUrl(env)}/admin#/listings/${businessId}`;
  return `\n<a href="${link}">Открыть в админке</a>`;
}

/** Сверка по расписанию: заказы, по которым продавец не вернулся на сайт после оплаты. */
export async function reconcilePayments(env: Env, db: DB, now = Date.now()): Promise<number> {
  if (!onlinePayments(env)) return 0;
  const rows = await db.select({ id: payments.id, orderId: payments.providerOrderId }).from(payments)
    .where(and(
      eq(payments.provider, 'paypal'),
      inArray(payments.status, ['created', 'pending']),
      gt(payments.createdAt, now - 3 * 86_400_000),
      lt(payments.createdAt, now - 2 * 60_000),
      sql`coalesce(${payments.checkedAt}, 0) < ${now - 5 * 60_000}`,
    ))
    .orderBy(asc(payments.checkedAt))
    .limit(5);
  let settled = 0;
  for (const r of rows) {
    if (!r.orderId) continue;
    try {
      const res = await settlePayPalOrder(env, db, r.orderId);
      if (res.state === 'completed') settled++;
    } catch (e) {
      console.error('reconcile payment', r.orderId, e instanceof Error ? e.message : e);
      await db.update(payments).set({ checkedAt: now }).where(eq(payments.id, r.id));
    }
  }
  // Неоплаченные заказы старше 3 дней PayPal уже не примет.
  await db.update(payments).set({ status: 'failed', note: 'заказ не оплачен', updatedAt: now })
    .where(and(eq(payments.status, 'created'), lt(payments.createdAt, now - 3 * 86_400_000)));
  return settled;
}

// ---------- Действия администратора ----------

export const MarkPaidInput = z.object({ note: z.string().max(300).optional() });

export async function markPaidManually(env: Env, db: DB, admin: AdminContext, id: number, note?: string) {
  const b = await getBusinessOr404(db, id);
  if (!b.sellerTgId) throw new HttpError(400, 'Это объявление создано администратором');
  if (await completedPayment(db, id)) throw new HttpError(409, 'Оплата уже отмечена');
  const { items, totalIls } = orderTotal(await getSellerSettings(db), b.extrasOrdered ?? []);
  const now = Date.now();
  const [pay] = await db.insert(payments).values({
    businessId: id, tgUserId: b.sellerTgId, provider: 'manual', status: 'completed', amount: totalIls * 100, currency: 'ILS', items,
    note: `${admin.name}${note ? `: ${note}` : ''}`, createdAt: now, updatedAt: now, completedAt: now,
  }).returning();
  // Если продавец уже отправил объявление — сразу дальше; если ещё заполняет — оплата учтётся при отправке.
  if (b.status === 'draft' && b.sellerStage === 'awaiting_payment') await afterPayment(env, db, id, pay);
}

export const ReturnInput = z.object({ comment: z.string().trim().min(3).max(1000) });

/** Вернуть продавцу на доработку (до публикации): он снова может редактировать, оплата сохраняется. */
export async function returnToSeller(env: Env, db: DB, admin: AdminContext, id: number, comment: string) {
  const b = await getBusinessOr404(db, id);
  if (!b.sellerTgId || b.status !== 'draft') throw new HttpError(400, 'Вернуть можно только неопубликованное объявление продавца');
  await setStage(db, id, 'editing');
  await audit(db, id, admin, 'update');
  await notifySeller(env, b.sellerTgId, `✏️ Администратор вернул объявление №${b.lotNumber} на доработку:\n\n${escapeHtml(comment)}\n\nИсправьте и отправьте снова — повторно платить не нужно.`, {
    text: 'Исправить', path: `/sell?edit=${id}`,
  });
}

// ---------- Запросы на изменение ----------

export async function createEditRequest(env: Env, db: DB, user: TgUser, id: number, text: string) {
  const b = await getOwn(db, user, id);
  if (b.status === 'draft' && b.sellerStage === 'editing') throw new HttpError(409, 'Черновик можно изменить самостоятельно');
  const [n] = await db.select({ n: sql<number>`count(*)` }).from(editRequests)
    .where(and(eq(editRequests.tgUserId, user.id), gt(editRequests.createdAt, Date.now() - 86_400_000)));
  if ((n?.n ?? 0) >= EDIT_REQUESTS_PER_DAY) throw new HttpError(429, 'Слишком много запросов за сутки — дождитесь ответа администратора');
  const [r] = await db.insert(editRequests).values({ businessId: id, tgUserId: user.id, text, createdAt: Date.now() }).returning();
  await notifyManagers(
    env, db,
    `✏️ Запрос на изменение №${r.id}\nЛот №${b.lotNumber} «${escapeHtml(b.publicTitle)}»\nОт: ${escapeHtml(displayName(user))}\n\n${escapeHtml(text)}${adminLinkHtml(env, id)}`,
  );
  return ownDetail(env, db, user, id);
}

export const ResolveInput = z.object({ status: z.enum(['done', 'rejected']), adminNote: z.string().max(1000).nullable().optional() });

export async function resolveEditRequest(env: Env, db: DB, admin: AdminContext, reqId: number, status: 'done' | 'rejected', adminNote?: string | null) {
  const [r] = await db.update(editRequests)
    .set({ status, adminNote: adminNote || null, handledBy: admin.id, handledByName: admin.name, handledAt: Date.now() })
    .where(eq(editRequests.id, reqId)).returning();
  if (!r) throw new HttpError(404, 'Запрос не найден');
  const b = await getBusinessOr404(db, r.businessId);
  const verdict = status === 'done' ? '✅ Изменения внесены' : '❌ Запрос отклонён';
  await notifySeller(env, r.tgUserId, `${verdict} — объявление №${b.lotNumber}.${adminNote ? `\n\n${escapeHtml(adminNote)}` : ''}`, {
    text: 'Мои объявления', path: `/sell?b=${b.id}`,
  });
  return r;
}

/** Блок «Продавец» в карточке лота в админке. */
export async function adminSellerInfo(db: DB, b: Business) {
  if (!b.sellerTgId) return null;
  const [pays, reqs] = await Promise.all([
    db.select().from(payments).where(eq(payments.businessId, b.id)).orderBy(desc(payments.createdAt)).limit(10),
    db.select().from(editRequests).where(eq(editRequests.businessId, b.id)).orderBy(desc(editRequests.createdAt)).limit(30),
  ]);
  return { tgId: b.sellerTgId, stage: b.sellerStage, payments: pays, editRequests: reqs, paid: pays.some((p) => p.status === 'completed'), extrasOrdered: b.extrasOrdered ?? [] };
}

/** Сводка для вкладки объявлений: что ждёт администратора. */
export async function sellerQueue(db: DB) {
  const [inReview, awaiting, openReqs] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(businesses).where(and(eq(businesses.status, 'draft'), eq(businesses.sellerStage, 'in_review'))),
    db.select({ n: sql<number>`count(*)` }).from(businesses).where(and(eq(businesses.status, 'draft'), eq(businesses.sellerStage, 'awaiting_payment'))),
    db.select({ n: sql<number>`count(*)` }).from(editRequests).where(eq(editRequests.status, 'new')),
  ]);
  return { inReview: inReview[0]?.n ?? 0, awaitingPayment: awaiting[0]?.n ?? 0, openEditRequests: openReqs[0]?.n ?? 0 };
}

export async function openEditRequests(db: DB) {
  return db.select({
    id: editRequests.id, businessId: editRequests.businessId, text: editRequests.text, createdAt: editRequests.createdAt,
    lotNumber: businesses.lotNumber, publicTitle: businesses.publicTitle,
  }).from(editRequests).innerJoin(businesses, eq(businesses.id, editRequests.businessId))
    .where(eq(editRequests.status, 'new')).orderBy(asc(editRequests.createdAt)).limit(100);
}

