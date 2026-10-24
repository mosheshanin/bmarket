import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import type { DB } from '../../db/client';
import { broadcasts, businesses, cities, events, leads, subscribers } from '../../db/schema';
import { israelDateIso } from '../../lib/format';
import { businessPath } from '../../lib/slug';

const DAY = 86_400_000;

export function periodStart(period: string, now = Date.now()): number {
  const days = { '7': 7, '30': 30, '90': 90 }[period];
  return days ? now - days * DAY : 0;
}

/** Смещение Израиля от UTC в мс на текущий момент (для группировки по дням). */
function israelOffsetMs(now = Date.now()): number {
  const local = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getTime();
  const utc = new Date(new Date(now).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return local - utc;
}

export async function getStats(db: DB, period: string, now = Date.now()) {
  const since = periodStart(period, now);
  const off = israelOffsetMs(now);
  const inPeriod = gte(events.createdAt, since);

  const [byType, opensBySource, leadsTotal, leadSources, topViews, topLeads, cityViews, cityLeads, dailyViews, dailyLeads, subsActive, subsNew, subsGone] = await Promise.all([
    db.select({ type: events.type, n: sql<number>`count(*)` }).from(events).where(inPeriod).groupBy(events.type),
    db.select({ source: events.source, n: sql<number>`count(*)` }).from(events).where(and(inPeriod, eq(events.type, 'app_open'))).groupBy(events.source),
    db.select({ n: sql<number>`count(*)` }).from(leads).where(gte(leads.createdAt, since)),
    db.select({ source: leads.source, utm: leads.utmSource, n: sql<number>`count(*)` }).from(leads).where(gte(leads.createdAt, since))
      .groupBy(leads.source, leads.utmSource).orderBy(desc(sql`count(*)`)).limit(20),
    db.select({ id: events.businessId, n: sql<number>`count(*)` }).from(events).where(and(inPeriod, eq(events.type, 'listing_view'), isNotNull(events.businessId)))
      .groupBy(events.businessId).orderBy(desc(sql`count(*)`)).limit(10),
    db.select({ id: leads.businessId, n: sql<number>`count(*)` }).from(leads).where(gte(leads.createdAt, since))
      .groupBy(leads.businessId).orderBy(desc(sql`count(*)`)).limit(10),
    db.select({ city: cities.name, n: sql<number>`count(*)` }).from(events)
      .innerJoin(businesses, eq(businesses.id, events.businessId)).innerJoin(cities, eq(cities.id, businesses.cityId))
      .where(and(inPeriod, eq(events.type, 'listing_view'))).groupBy(cities.name),
    db.select({ city: cities.name, n: sql<number>`count(*)` }).from(leads)
      .innerJoin(businesses, eq(businesses.id, leads.businessId)).innerJoin(cities, eq(cities.id, businesses.cityId))
      .where(gte(leads.createdAt, since)).groupBy(cities.name),
    db.select({ day: sql<number>`(${events.createdAt} + ${off}) / ${DAY}`, n: sql<number>`count(*)` }).from(events)
      .where(and(gte(events.createdAt, since || now - 90 * DAY), eq(events.type, 'listing_view'))).groupBy(sql`1`),
    db.select({ day: sql<number>`(${leads.createdAt} + ${off}) / ${DAY}`, n: sql<number>`count(*)` }).from(leads)
      .where(gte(leads.createdAt, since || now - 90 * DAY)).groupBy(sql`1`),
    db.select({ n: sql<number>`count(*)` }).from(subscribers).where(eq(subscribers.isActive, true)),
    db.select({ n: sql<number>`count(*)` }).from(subscribers).where(gte(subscribers.subscribedAt, since)),
    db.select({ n: sql<number>`count(*)` }).from(subscribers).where(and(eq(subscribers.isActive, false), gte(sql`coalesce(${subscribers.unsubscribedAt}, ${subscribers.blockedAt})`, since))),
  ]);

  const count = (t: string) => byType.find((r) => r.type === t)?.n ?? 0;
  const views = count('listing_view');
  const leadsN = leadsTotal[0]?.n ?? 0;

  const ids = [...new Set([...topViews, ...topLeads].map((r) => r.id).filter((x): x is number => !!x))];
  const lots = ids.length
    ? await db.select({ id: businesses.id, lot: businesses.lotNumber, slug: businesses.slug, title: businesses.publicTitle }).from(businesses).where(inArray(businesses.id, ids))
    : [];
  const lotMap = new Map(lots.map((l) => [l.id, { ...l, path: businessPath(l.lot, l.slug) }]));
  const decorate = (rows: { id: number | null; n: number }[]) => rows.map((r) => ({ ...lotMap.get(r.id!), n: r.n }));

  // График по дням: просмотры карточек и заявки.
  const start = Math.floor(((since || now - 90 * DAY) + off) / DAY);
  const end = Math.floor((now + off) / DAY);
  const vMap = new Map(dailyViews.map((r) => [Math.floor(r.day), r.n]));
  const lMap = new Map(dailyLeads.map((r) => [Math.floor(r.day), r.n]));
  const daily = [];
  for (let d = start; d <= end; d++) {
    daily.push({ date: israelDateIso(d * DAY - off + 12 * 3600_000), views: vMap.get(d) ?? 0, leads: lMap.get(d) ?? 0 });
  }

  const cityMap = new Map<string, { city: string; views: number; leads: number }>();
  for (const r of cityViews) cityMap.set(r.city, { city: r.city, views: r.n, leads: 0 });
  for (const r of cityLeads) cityMap.set(r.city, { ...(cityMap.get(r.city) ?? { city: r.city, views: 0 }), leads: r.n });

  return {
    period,
    opens: {
      total: count('app_open'),
      miniApp: opensBySource.find((r) => r.source === 'mini_app')?.n ?? 0,
      web: opensBySource.find((r) => r.source === 'web')?.n ?? 0,
    },
    views,
    formOpens: count('lead_form_open'),
    leads: leadsN,
    conversion: views ? Math.round((leadsN / views) * 1000) / 10 : 0,
    subscribers: { active: subsActive[0]?.n ?? 0, new: subsNew[0]?.n ?? 0, left: subsGone[0]?.n ?? 0 },
    topByViews: decorate(topViews),
    topByLeads: decorate(topLeads),
    cities: [...cityMap.values()].sort((a, b) => b.views - a.views),
    leadSources: leadSources.map((r) => ({ source: r.source === 'mini_app' ? 'Мини-приложение' : 'Сайт', utm: r.utm, n: r.n })),
    daily,
  };
}

export async function subscribersSummary(db: DB, now = Date.now()) {
  const [[active], [w], [m], history] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(subscribers).where(eq(subscribers.isActive, true)),
    db.select({ n: sql<number>`count(*)` }).from(subscribers).where(gte(subscribers.subscribedAt, now - 7 * DAY)),
    db.select({ n: sql<number>`count(*)` }).from(subscribers).where(gte(subscribers.subscribedAt, now - 30 * DAY)),
    db.select().from(broadcasts).orderBy(desc(broadcasts.id)).limit(30),
  ]);
  const ids = [...new Set(history.flatMap((h) => h.businessIds))];
  const lots = ids.length ? await db.select({ id: businesses.id, lot: businesses.lotNumber }).from(businesses).where(inArray(businesses.id, ids)) : [];
  const lotMap = new Map(lots.map((l) => [l.id, l.lot]));
  return {
    active: active?.n ?? 0,
    growth7: w?.n ?? 0,
    growth30: m?.n ?? 0,
    broadcasts: history.map((h) => ({ ...h, lots: h.businessIds.map((id) => lotMap.get(id)).filter(Boolean) })),
  };
}
