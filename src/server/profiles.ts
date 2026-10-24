import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DB } from '../db/client';
import { businesses, categories, cities, events, SURVEY_INTENTS, visitorProfiles, type VisitorProfile } from '../db/schema';
import { escapeHtml, normalizePhone, prettyPhone } from '../lib/format';
import { BUDGETS, BUYER_WISHES, SELLER_WISHES, TIMELINES, ALL_WISH_LABELS, describePrefs } from '../lib/match';
import { businessPath } from '../lib/slug';
import type { TgUser } from '../lib/telegram-auth';
import { HttpError } from './http';
import { imageUrl, listPublished } from './public';
import { getSetting, setSetting } from './settings';
import { sendToManagers } from './telegram';

/**
 * Опрос при первом запуске мини-приложения: хочет купить или продать, что ищет.
 * Ответы видит сам пользователь (подборка «Для вас») и менеджеры (заявки, статистика).
 */

const SURVEY_KEY = 'survey_enabled';

export async function surveyEnabled(db: DB): Promise<boolean> {
  return (await getSetting(db, SURVEY_KEY)) === '1';
}

export async function setSurveyEnabled(db: DB, on: boolean): Promise<void> {
  await setSetting(db, SURVEY_KEY, on ? '1' : '0');
}

const WISH_KEYS = [...BUYER_WISHES, ...SELLER_WISHES].map((w) => w.key) as [string, ...string[]];
const ids = z.array(z.number().int().positive()).max(30);

export const ProfileInput = z.object({
  intent: z.enum(SURVEY_INTENTS).nullable(),
  categories: ids.default([]),
  cities: ids.default([]),
  budget: z.enum(BUDGETS.map((b) => b.key) as [string, ...string[]]).nullable().default(null),
  timeline: z.enum(TIMELINES.map((t) => t.key) as [string, ...string[]]).nullable().default(null),
  wishes: z.array(z.enum(WISH_KEYS)).max(WISH_KEYS.length).default([]),
  comment: z.string().trim().max(500).nullable().default(null),
  notifyMatching: z.boolean().optional(),
  /** completed — опрос пройден; skipped — пропущен (не показывать снова). */
  status: z.enum(['completed', 'skipped']),
});
export type ProfileInputT = z.infer<typeof ProfileInput>;

/** То, что пользователь видит о себе (без служебных полей). */
export function ownProfile(p: VisitorProfile | null) {
  if (!p) return null;
  return {
    intent: p.intent, categories: p.categories, cities: p.cities, budget: p.budget, timeline: p.timeline,
    wishes: p.wishes, comment: p.comment, notifyMatching: p.notifyMatching,
    completed: !!p.completedAt, skipped: !p.completedAt && !!p.skippedAt, consultRequested: !!p.consultRequestedAt,
  };
}

export async function getProfile(db: DB, userId: number): Promise<VisitorProfile | null> {
  const [p] = await db.select().from(visitorProfiles).where(eq(visitorProfiles.telegramUserId, userId));
  return p ?? null;
}

export async function saveProfile(db: DB, user: TgUser, input: ProfileInputT) {
  const now = Date.now();
  const sell = input.intent === 'sell';
  const data = {
    intent: input.intent,
    categories: input.categories,
    cities: input.cities,
    // Бюджет — только у покупателя, сроки — только у продавца.
    budget: input.intent === 'buy' ? input.budget : null,
    timeline: sell ? input.timeline : null,
    wishes: input.wishes,
    comment: input.comment || null,
    username: user.username ?? null,
    firstName: user.first_name ?? null,
    updatedAt: now,
    ...(input.notifyMatching !== undefined ? { notifyMatching: input.notifyMatching } : {}),
    ...(input.status === 'completed' ? { completedAt: now } : { skippedAt: now }),
  };
  const [p] = await db
    .insert(visitorProfiles)
    .values({ telegramUserId: user.id, createdAt: now, ...data })
    .onConflictDoUpdate({ target: visitorProfiles.telegramUserId, set: data })
    .returning();
  return p;
}

export async function setNotifyMatching(db: DB, userId: number, on: boolean): Promise<void> {
  await db.update(visitorProfiles).set({ notifyMatching: on, updatedAt: Date.now() }).where(eq(visitorProfiles.telegramUserId, userId));
}

// ---------- Данные для опроса ----------

/**
 * Всё, что нужно экрану опроса: справочники, опубликованные лоты (только публичные поля — для живого счётчика
 * и мини-подборки) и спрос по отраслям (для продавцов: сколько покупателей ищут такую сферу).
 */
export async function surveyFacets(env: Env, db: DB) {
  const since = Date.now() - 30 * 86_400_000;
  const [cats, cityRows, lots, buyersByCat, buyersAny, buyersTotal, viewsByCat] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(categories.sortOrder, categories.name),
    db.select({ id: cities.id, name: cities.name }).from(cities).where(eq(cities.isActive, true)).orderBy(cities.sortOrder, cities.name),
    listPublished(db),
    db.all<{ cat: number; n: number }>(sql`
      select j.value as cat, count(*) as n from ${visitorProfiles}, json_each(${visitorProfiles.categories}) j
      where ${visitorProfiles.intent} = 'buy' and ${visitorProfiles.completedAt} is not null group by j.value`),
    db.select({ n: sql<number>`count(*)` }).from(visitorProfiles)
      .where(and(eq(visitorProfiles.intent, 'buy'), isNotNull(visitorProfiles.completedAt), sql`json_array_length(${visitorProfiles.categories}) = 0`)),
    db.select({ n: sql<number>`count(*)` }).from(visitorProfiles).where(and(eq(visitorProfiles.intent, 'buy'), isNotNull(visitorProfiles.completedAt))),
    db.select({ cat: businesses.categoryId, n: sql<number>`count(*)` }).from(events)
      .innerJoin(businesses, eq(businesses.id, events.businessId))
      .where(and(eq(events.type, 'listing_view'), gt(events.createdAt, since)))
      .groupBy(businesses.categoryId),
  ]);
  const any = buyersAny[0]?.n ?? 0;
  const buyers: Record<number, number> = {};
  for (const c of cats) buyers[c.id] = any;
  for (const r of buyersByCat) buyers[Number(r.cat)] = (buyers[Number(r.cat)] ?? any) + r.n;
  const views: Record<number, number> = {};
  for (const r of viewsByCat) if (r.cat) views[r.cat] = r.n;
  return {
    categories: cats,
    cities: cityRows,
    lots: lots.map((l) => ({
      id: l.id, categoryId: l.categoryId, cityId: l.cityId, priceIls: l.priceIls, paybackMonths: l.paybackMonths,
      title: l.publicTitle, path: businessPath(l.lotNumber, l.slug), img: l.cover ? imageUrl(env, l.cover.r2KeySmall) : null,
    })),
    demand: { buyersByCategory: buyers, buyersTotal: buyersTotal[0]?.n ?? 0, viewsByCategory30d: views },
  };
}

// ---------- Для менеджеров ----------

async function nameMaps(db: DB) {
  const [cats, cityRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db.select({ id: cities.id, name: cities.name }).from(cities),
  ]);
  return { categories: new Map(cats.map((c) => [c.id, c.name])), cities: new Map(cityRows.map((c) => [c.id, c.name])) };
}

/** «Покупатель ищет: Кафе, Хайфа · до ₪ 500 000 · окупаемость до 2 лет» — для сообщений менеджерам (HTML). */
export async function profileSummary(db: DB, userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const p = await getProfile(db, userId);
  if (!p?.completedAt || !p.intent || p.intent === 'browse') return null;
  const names = await nameMaps(db);
  const head = p.intent === 'buy' ? 'Ищет' : 'Продаёт';
  const wishes = p.wishes.map((w) => ALL_WISH_LABELS[w]).filter(Boolean).map((w) => w.toLowerCase());
  const lines = [`${head}: ${escapeHtml(describePrefs(p, names))}${wishes.length ? ` · ${escapeHtml(wishes.join(', '))}` : ''}`];
  if (p.comment) lines.push(`Пожелания: ${escapeHtml(p.comment)}`);
  return lines.join('\n');
}

export const ConsultInput = z.object({ phone: z.string().max(40).nullable().optional() });

/** «Связаться с менеджером» из итога опроса: сообщение в группу менеджеров с ответами и контактом. */
export async function requestConsult(env: Env, db: DB, user: TgUser, rawPhone?: string | null) {
  const p = await getProfile(db, user.id);
  if (!p) throw new HttpError(409, 'Сначала ответьте на вопросы');
  if (p.consultRequestedAt && Date.now() - p.consultRequestedAt < 86_400_000) {
    return { ok: true, repeated: true };
  }
  // Номер из Telegram (requestContact) приходит без «+»: 79161234567.
  const phone = rawPhone ? normalizePhone(rawPhone) ?? normalizePhone('+' + rawPhone.replace(/\D/g, '')) : null;
  const summary = await profileSummary(db, user.id);
  const who = user.username ? `@${escapeHtml(user.username)}` : `<a href="tg://user?id=${user.id}">${escapeHtml(user.first_name ?? 'профиль')}</a>`;
  const title = p.intent === 'sell' ? '🧭 Продавец просит консультацию' : '🧭 Покупатель просит подобрать бизнес';
  const text = [
    `<b>${title}</b>`,
    `Telegram: ${who}${phone ? `\nТелефон: ${escapeHtml(prettyPhone(phone))}` : ''}`,
    summary ?? '',
    '',
    'Источник: опрос при первом запуске',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  await db.update(visitorProfiles).set({ consultRequestedAt: Date.now(), phone: phone ?? p.phone, updatedAt: Date.now() })
    .where(eq(visitorProfiles.telegramUserId, user.id));
  try {
    await sendToManagers(env, db, text);
  } catch {
    // Ошибка записана в settings — администратор увидит её в админке; запрос сохранён в базе.
  }
  return { ok: true, repeated: false };
}

/** Раздел «Опрос» в статистике админки. */
export async function surveyStats(db: DB) {
  const [byIntent, skipped, budgets, timelines, recentConsults, enabled] = await Promise.all([
    db.select({ intent: visitorProfiles.intent, n: sql<number>`count(*)` }).from(visitorProfiles)
      .where(isNotNull(visitorProfiles.completedAt)).groupBy(visitorProfiles.intent),
    db.select({ n: sql<number>`count(*)` }).from(visitorProfiles)
      .where(and(isNotNull(visitorProfiles.skippedAt), sql`${visitorProfiles.completedAt} is null`)),
    db.select({ k: visitorProfiles.budget, n: sql<number>`count(*)` }).from(visitorProfiles)
      .where(and(eq(visitorProfiles.intent, 'buy'), isNotNull(visitorProfiles.completedAt))).groupBy(visitorProfiles.budget),
    db.select({ k: visitorProfiles.timeline, n: sql<number>`count(*)` }).from(visitorProfiles)
      .where(and(eq(visitorProfiles.intent, 'sell'), isNotNull(visitorProfiles.completedAt))).groupBy(visitorProfiles.timeline),
    db.select().from(visitorProfiles).where(isNotNull(visitorProfiles.consultRequestedAt))
      .orderBy(desc(visitorProfiles.consultRequestedAt)).limit(20),
    surveyEnabled(db),
  ]);
  const topCats = await db.all<{ name: string; buy: number; sell: number }>(sql`
    select c.name as name,
      sum(case when p.intent = 'buy' then 1 else 0 end) as buy,
      sum(case when p.intent = 'sell' then 1 else 0 end) as sell
    from ${visitorProfiles} p, json_each(p.categories) j join ${categories} c on c.id = j.value
    where p.completed_at is not null group by c.id order by count(*) desc limit 8`);
  const names = await nameMaps(db);
  const count = (i: string) => byIntent.find((r) => r.intent === i)?.n ?? 0;
  return {
    enabled,
    completed: { buy: count('buy'), sell: count('sell'), browse: count('browse') },
    skipped: skipped[0]?.n ?? 0,
    budgets: BUDGETS.map((b) => ({ label: b.label, n: budgets.find((r) => r.k === b.key)?.n ?? 0 })),
    timelines: TIMELINES.map((t) => ({ label: t.label, n: timelines.find((r) => r.k === t.key)?.n ?? 0 })),
    topCategories: topCats,
    consults: recentConsults.map((p) => ({
      userId: p.telegramUserId, username: p.username, firstName: p.firstName, phone: p.phone, intent: p.intent,
      at: p.consultRequestedAt, summary: describePrefs(p, names), comment: p.comment,
    })),
  };
}

/** Незавершённое объявление продавца (черновик, заявка, проверка) — для блока на главной. */
export async function openSellerListing(db: DB, userId: number) {
  const [b] = await db
    .select({ id: businesses.id, lotNumber: businesses.lotNumber, title: businesses.publicTitle, stage: businesses.sellerStage })
    .from(businesses)
    .where(and(
      eq(businesses.sellerTgId, userId),
      eq(businesses.status, 'draft'),
      sql`${businesses.sellerStage} in ('editing', 'awaiting_payment', 'in_review')`,
    ))
    .orderBy(desc(businesses.updatedAt))
    .limit(1);
  return b ?? null;
}
