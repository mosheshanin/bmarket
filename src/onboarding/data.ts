import { storageGet, storageSet, tgHeaders } from '../scripts/tg';
import type { MatchPrefs } from '../lib/match';

export type Intent = 'buy' | 'sell' | 'browse';

export interface Answers {
  intent: Intent | null;
  categories: number[];
  cities: number[];
  budget: string | null;
  timeline: string | null;
  wishes: string[];
  comment: string;
}

export interface Profile extends Omit<Answers, 'comment'> {
  comment: string | null;
  notifyMatching: boolean;
  completed: boolean;
  skipped: boolean;
  consultRequested: boolean;
}

export interface FacetLot {
  id: number; categoryId: number | null; cityId: number | null; priceIls: number | null; paybackMonths: number | null;
  title: string; path: string; img: string | null;
}
export interface Facets {
  categories: { id: number; name: string }[];
  cities: { id: number; name: string }[];
  lots: FacetLot[];
  demand: { buyersByCategory: Record<number, number>; buyersTotal: number; viewsByCategory30d: Record<number, number> };
}

export const EMPTY: Answers = { intent: null, categories: [], cities: [], budget: null, timeline: null, wishes: [], comment: '' };

const LOCAL = 'bm_profile';

/** Копия ответов в телефоне: подборка на главной работает без запроса к серверу. */
export function readLocal(): Profile | null {
  try {
    const raw = storageGet(LOCAL);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}
export function writeLocal(p: Profile | null) {
  storageSet(LOCAL, p ? JSON.stringify(p) : '');
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await tgHeaders()) };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(path, { method: init.method ?? 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Ошибка ${r.status}`);
  return data as T;
}

export const fetchProfile = () => call<{ surveyEnabled: boolean; profile: Profile | null }>('/api/profile');
export const fetchFacets = () => call<Facets>('/api/survey/facets');
export const saveAnswers = (a: Answers, status: 'completed' | 'skipped') =>
  call<{ profile: Profile }>('/api/profile', { method: 'PUT', body: { ...a, comment: a.comment.trim() || null, status } });
export const setNotify = (on: boolean) => call('/api/profile/notify', { method: 'POST', body: { on } });
export const requestConsult = (phone: string | null) => call<{ ok: boolean; repeated: boolean }>('/api/profile/consult', { method: 'POST', body: { phone } });

export const toPrefs = (a: Pick<Answers, 'categories' | 'cities' | 'budget' | 'wishes'>): MatchPrefs => ({
  categories: a.categories, cities: a.cities, budget: a.budget, wishes: a.wishes,
});
