/**
 * Дополнительные платные услуги при размещении объявления продавцом и бейджи, которые они дают.
 * Бейдж ставит администратор только после того, как услуга действительно выполнена.
 */
export const EXTRAS = [
  {
    key: 'valuation',
    title: 'Оценка стоимости бизнеса',
    badge: 'Оценка подтверждена',
    explain: 'Бизнес оценили эксперты Бизнес Маркета.',
    sell: 'Эксперты Бизнес Маркета оценят бизнес; после оценки объявление получит бейдж «Оценка подтверждена».',
    why: 'Обоснованная цена: вы не продешевите и не отпугнёте покупателей завышенной ценой, а в торге сможете опереться на заключение экспертов.',
    defaultPrice: 1500,
  },
  {
    key: 'audit',
    title: 'Экспертный финансовый аудит',
    badge: 'Пройден аудит',
    explain: 'Проведён экспертный финансовый аудит.',
    sell: 'Эксперты проверят финансовые показатели; после аудита объявление получит бейдж «Пройден аудит».',
    why: 'Покупатель видит, что оборот и прибыль проверены: меньше сомнений и встречных проверок — быстрее путь до задатка.',
    defaultPrice: 4000,
  },
] as const;

export type ExtraKey = (typeof EXTRAS)[number]['key'];
export const EXTRA_KEYS = EXTRAS.map((e) => e.key) as [ExtraKey, ...ExtraKey[]];
export const extraByKey = (k: string) => EXTRAS.find((e) => e.key === k);

export interface Prices { priceIls: number; valuationPriceIls: number; auditPriceIls: number }

export function extraPrice(p: Prices, key: string): number {
  return key === 'valuation' ? p.valuationPriceIls : key === 'audit' ? p.auditPriceIls : 0;
}

/** Состав и сумма заказа: размещение + выбранные услуги (в шекелях). */
export function orderTotal(p: Prices, extras: readonly string[]): { items: string[]; totalIls: number } {
  const chosen = EXTRA_KEYS.filter((k) => extras.includes(k));
  return {
    items: [...(p.priceIls > 0 ? ['placement'] : []), ...chosen],
    totalIls: p.priceIls + chosen.reduce((s, k) => s + extraPrice(p, k), 0),
  };
}

export const ITEM_LABELS: Record<string, string> = { placement: 'размещение', valuation: 'оценка', audit: 'аудит' };

/** Почему стоит заказать услуги — коротко, с точки зрения продавца. Без обещаний конкретных цифр. */
export const EXTRAS_WHY = [
  'Главная причина долгих продаж — недоверие к цифрам. Подтверждённая оценка и аудит снимают его заранее, поэтому продажа обычно идёт заметно быстрее.',
  'Объявление с бейджем выделяется в ленте: покупатели в первую очередь открывают проверенные предложения.',
  'Меньше вопросов и повторных проверок со стороны покупателя — переговоры короче, сделка ближе.',
  'Проверенные цифры помогают удержать цену и не уступать в торге.',
];
