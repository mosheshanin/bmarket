import { desc, eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { exchangeRates, settings } from '../db/schema';
import { israelDateIso } from '../lib/format';
import { RATE_MAX_AGE_DAYS } from './public';
import { notifyManagers } from './telegram';

/**
 * Представительский курс Банка Израиля (שער יציג), раздел 9.
 * Основной источник — база рядов SDMX (ряды RER_USD_ILS, RER_EUR_ILS), запасной — PublicApi.
 * Адреса проверены 24.10.2026.
 */
export const BOI_SDMX = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/';
export const BOI_PUBLIC_API = 'https://boi.org.il/PublicApi/GetExchangeRates';

export interface FetchedRates {
  date: string;
  usdIls: number;
  eurIls: number;
  source: string;
}

/** Разбор CSV из SDMX: последняя строка с TIME_PERIOD и OBS_VALUE. */
export function parseSdmxCsv(csv: string): { date: string; value: number } | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const header = lines[0].split(',');
  const iDate = header.indexOf('TIME_PERIOD');
  const iVal = header.indexOf('OBS_VALUE');
  if (iDate < 0 || iVal < 0) return null;
  let best: { date: string; value: number } | null = null;
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const date = cols[iDate];
    const value = Number(cols[iVal]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && value > 0 && (!best || date > best.date)) best = { date, value };
  }
  return best;
}

async function fetchSdmx(series: string, start: string): Promise<{ date: string; value: number } | null> {
  const res = await fetch(`${BOI_SDMX}${series}?startperiod=${start}&format=csv`, {
    headers: { accept: 'text/csv' },
    cf: { cacheTtl: 0 },
  } as RequestInit);
  if (!res.ok) throw new Error(`SDMX ${series}: HTTP ${res.status}`);
  return parseSdmxCsv(await res.text());
}

export function parsePublicApi(data: unknown): FetchedRates | null {
  const list = (data as { exchangeRates?: Array<{ key: string; currentExchangeRate: number; unit: number; lastUpdate: string }> })?.exchangeRates;
  if (!Array.isArray(list)) return null;
  const usd = list.find((r) => r.key === 'USD');
  const eur = list.find((r) => r.key === 'EUR');
  if (!usd || !eur) return null;
  const date = israelDateIso(Date.parse(usd.lastUpdate));
  return {
    date,
    usdIls: usd.currentExchangeRate / (usd.unit || 1),
    eurIls: eur.currentExchangeRate / (eur.unit || 1),
    source: 'boi_public_api',
  };
}

export async function fetchBoiRates(now = Date.now()): Promise<FetchedRates> {
  const start = israelDateIso(now - 10 * 86_400_000);
  try {
    const [usd, eur] = await Promise.all([fetchSdmx('RER_USD_ILS', start), fetchSdmx('RER_EUR_ILS', start)]);
    if (usd && eur) {
      return { date: usd.date > eur.date ? usd.date : eur.date, usdIls: usd.value, eurIls: eur.value, source: 'boi_sdmx' };
    }
    throw new Error('SDMX: пустой ответ');
  } catch (e) {
    console.warn('SDMX failed, falling back to PublicApi', e);
    const res = await fetch(BOI_PUBLIC_API, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`PublicApi: HTTP ${res.status}`);
    const parsed = parsePublicApi(await res.json());
    if (!parsed) throw new Error('PublicApi: неожиданный формат');
    return parsed;
  }
}

export async function updateRates(env: Env, db: DB, now = Date.now()): Promise<void> {
  try {
    const r = await fetchBoiRates(now);
    await db
      .insert(exchangeRates)
      .values({ ...r, fetchedAt: now })
      .onConflictDoUpdate({ target: exchangeRates.date, set: { usdIls: r.usdIls, eurIls: r.eurIls, source: r.source, fetchedAt: now } });
  } catch (e) {
    console.error('updateRates failed', e);
  }
  // Если курс старше 7 дней — суммы в USD/EUR скрыты; оповестить менеджеров (раз в день).
  const [last] = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)).limit(1);
  const ageDays = last ? (now - Date.parse(last.date + 'T00:00:00Z')) / 86_400_000 : Infinity;
  if (ageDays > RATE_MAX_AGE_DAYS) {
    const today = israelDateIso(now);
    const [s] = await db.select().from(settings).where(eq(settings.key, 'rates_alert_date'));
    if (s?.value !== today) {
      await notifyManagers(env, `⚠️ Курс Банка Израиля не обновлялся больше ${RATE_MAX_AGE_DAYS} дней (последний: ${last?.date ?? 'нет'}). Цены в USD и EUR скрыты на сайте.`);
      await db.insert(settings).values({ key: 'rates_alert_date', value: today })
        .onConflictDoUpdate({ target: settings.key, set: { value: today } });
    }
  }
}
