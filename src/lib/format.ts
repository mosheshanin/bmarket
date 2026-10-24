/** Форматы раздела 13: цены «₪ 450 000», даты «24.10.2026», время Asia/Jerusalem. */

export const TZ = 'Asia/Jerusalem';
const NBSP = ' ';

/** 450000 → «450 000» (неразрывные пробелы). */
export function groupDigits(n: number): string {
  const sign = n < 0 ? '-' : '';
  const s = Math.round(Math.abs(n)).toString();
  return sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatIls(n: number): string {
  return `₪${NBSP}${groupDigits(n)}`;
}

/** Округление валютных сумм: до тысячи от 10 000, иначе до десятка (раздел 9). */
export function roundForeign(n: number): number {
  if (n >= 10_000) return Math.round(n / 1000) * 1000;
  return Math.round(n / 10) * 10;
}

export function formatUsd(ils: number, usdIls: number): string {
  return `≈${NBSP}$${groupDigits(roundForeign(ils / usdIls))}`;
}

export function formatEur(ils: number, eurIls: number): string {
  return `≈${NBSP}€${groupDigits(roundForeign(ils / eurIls))}`;
}

/** Русское склонение: plural(5, ['месяц','месяца','месяцев']). */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function paybackMonths(priceIls?: number | null, profitIls?: number | null): number | null {
  if (!priceIls || !profitIls || profitIls <= 0) return null;
  return Math.max(1, Math.round(priceIls / profitIls));
}

/** 18 → «18 месяцев», 30 → «30 месяцев (2,5 года)». */
export function formatPayback(months: number): string {
  const base = `${months}${NBSP}${plural(months, ['месяц', 'месяца', 'месяцев'])}`;
  if (months < 24) return base;
  const years = Math.round((months / 12) * 10) / 10;
  const yStr = years.toString().replace('.', ',');
  const word = Number.isInteger(years) ? plural(years, ['год', 'года', 'лет']) : 'года';
  return `${base} (${yStr}${NBSP}${word})`;
}

function parts(ts: number | Date) {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

/** «24.10.2026» по времени Израиля. */
export function formatDate(ts: number | Date): string {
  const { y, m, d } = parts(ts);
  return `${d}.${m}.${y}`;
}

/** «24.10.2026 11:42» по времени Израиля. */
export function formatDateTime(ts: number | Date): string {
  const { y, m, d, h, min } = parts(ts);
  return `${d}.${m}.${y} ${h}:${min}`;
}

/** YYYY-MM-DD → DD.MM.YYYY */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** Дата в Израиле в виде YYYY-MM-DD. */
export function israelDateIso(ts: number = Date.now()): string {
  const { y, m, d } = parts(ts);
  return `${y}-${m}-${d}`;
}

/** Телефон → международный формат без пробелов: «054-123-4567» → «+972541234567». */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, '');
  if (/^0(5\d|[2-4]|[89]|7\d)\d{7}$/.test(s)) return '+972' + s.slice(1);
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  if (/^972\d{8,9}$/.test(s)) return '+' + s;
  return null;
}

/** «+972541234567» → «+972 54 123 4567». */
export function prettyPhone(e164: string): string {
  const m = /^\+972(\d{2})(\d{3})(\d{4})$/.exec(e164);
  if (m) return `+972 ${m[1]} ${m[2]} ${m[3]}`;
  return e164;
}

/** Иврит внутри русского текста — в изолирующих маркерах, чтобы не «переворачивались» скобки. */
const he = (t: string) => `\u2068${t}\u2069`;

export const LEGAL_FORM_LABELS: Record<string, string> = {
  company: `Компания (${he('חברה בע״מ')})`,
  osek_murshe: `Осек мурше (${he('עוסק מורשה')})`,
  osek_patur: `Осек патур (${he('עוסק פטור')})`,
  other: 'Другое',
};

export const LICENSE_LABELS: Record<string, string> = {
  yes: `Есть (${he('רישיון עסק')})`,
  not_required: 'Не требуется',
  in_progress: 'В процессе оформления',
};

export const INCLUDED_LABELS: Record<string, string> = {
  equipment: 'Оборудование',
  furniture: 'Мебель',
  inventory: 'Товарный остаток',
  client_base: 'Клиентская база',
  website_social: 'Сайт и соцсети',
  brand: 'Бренд',
  licenses: 'Лицензии и разрешения',
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  closed_won: 'Закрыта: сделка',
  closed_lost: 'Закрыта: отказ',
};

export const CONTACT_LABELS: Record<string, string> = {
  phone: 'Телефон',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
