/**
 * Подбор лотов под ответы опроса. Общий код для сервера (рассылка) и браузера (счётчик, «Для вас»).
 * Пустой список отраслей/городов — «любые».
 */

export const BUDGETS = [
  { key: 'b250', label: 'до ₪ 250 000', max: 250_000 },
  { key: 'b500', label: 'до ₪ 500 000', max: 500_000 },
  { key: 'b1000', label: 'до ₪ 1 000 000', max: 1_000_000 },
  { key: 'b2000', label: 'до ₪ 2 000 000', max: 2_000_000 },
  { key: 'b2000plus', label: 'больше ₪ 2 000 000', max: null },
  { key: 'unknown', label: 'Пока не определился', max: null },
] as const;

export const TIMELINES = [
  { key: 'asap', label: 'Как можно скорее', hint: 'в ближайший месяц' },
  { key: 'q', label: 'В течение 3–6 месяцев', hint: 'есть время подготовиться' },
  { key: 'explore', label: 'Пока изучаю рынок', hint: 'хочу понять, сколько стоит бизнес' },
] as const;

export const BUYER_WISHES = [
  { key: 'payback24', label: 'Окупаемость до 2 лет' },
  { key: 'staff', label: 'С работающим персоналом' },
  { key: 'training', label: 'Обучение от владельца' },
  { key: 'remote', label: 'Можно управлять удалённо' },
  { key: 'relocation', label: 'Нужна помощь с переездом и документами' },
] as const;

export const SELLER_WISHES = [
  { key: 'valuation', label: 'Нужна оценка стоимости' },
  { key: 'confidential', label: 'Важна полная конфиденциальность' },
  { key: 'handover', label: 'Помощь с документами и передачей дел' },
  { key: 'staying', label: 'Готов остаться на время передачи' },
] as const;

export const ALL_WISH_LABELS: Record<string, string> = Object.fromEntries(
  [...BUYER_WISHES, ...SELLER_WISHES].map((w) => [w.key, w.label]),
);

export interface MatchPrefs {
  categories: number[];
  cities: number[];
  budget: string | null;
  wishes: string[];
}

export interface MatchLot {
  categoryId: number | null;
  cityId: number | null;
  priceIls: number | null;
  paybackMonths: number | null;
}

export function budgetMax(key: string | null | undefined): number | null {
  return BUDGETS.find((b) => b.key === key)?.max ?? null;
}

/** Подходит ли лот. Неизвестные значения лота (нет цены, окупаемости) не исключают его. */
export function matchesPrefs(lot: MatchLot, p: MatchPrefs): boolean {
  if (p.categories.length && (lot.categoryId === null || !p.categories.includes(lot.categoryId))) return false;
  if (p.cities.length && (lot.cityId === null || !p.cities.includes(lot.cityId))) return false;
  const max = budgetMax(p.budget);
  if (max !== null && lot.priceIls !== null && lot.priceIls > max) return false;
  if (p.wishes.includes('payback24') && lot.paybackMonths !== null && lot.paybackMonths > 24) return false;
  return true;
}

/** Коротко о запросе: «Кафе и рестораны, Хайфа · до ₪ 500 000». */
export function describePrefs(p: MatchPrefs & { intent?: string | null; timeline?: string | null }, names: { categories: Map<number, string>; cities: Map<number, string> }): string {
  const what = p.categories.map((id) => names.categories.get(id)).filter(Boolean).join(', ') || 'любая сфера';
  const where = p.cities.map((id) => names.cities.get(id)).filter(Boolean).join(', ') || 'вся страна';
  const parts = [`${what}, ${where}`];
  if (p.intent === 'sell') {
    const t = TIMELINES.find((x) => x.key === p.timeline)?.label;
    if (t) parts.push(t.toLowerCase());
  } else {
    const b = BUDGETS.find((x) => x.key === p.budget);
    if (b && b.max !== null) parts.push(b.label);
  }
  return parts.join(' · ');
}
