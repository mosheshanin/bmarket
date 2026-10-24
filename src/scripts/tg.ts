/** Общие клиентские хелперы: Telegram WebApp, посетитель, UTM. */

export function isTg(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('tg');
}

/** Дождаться конца заставки (если она сейчас показывается). */
export function afterSplash(): Promise<void> {
  return new Promise((resolve) => {
    if (!document.documentElement.classList.contains('splash-on')) return resolve();
    window.addEventListener('bm:splash-done', () => resolve(), { once: true });
  });
}

let waPromise: Promise<TgWebApp | null> | null = null;

/** WebApp появляется после загрузки telegram-web-app.js (подключается только в Telegram). */
export function getWebApp(): Promise<TgWebApp | null> {
  if (!isTg()) return Promise.resolve(null);
  if (waPromise) return waPromise;
  waPromise = new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const wa = window.Telegram?.WebApp;
      if (wa) return resolve(wa);
      if (Date.now() - started > 5000) return resolve(null);
      setTimeout(tick, 25);
    };
    tick();
  });
  return waPromise;
}

export async function initData(): Promise<string> {
  const wa = await getWebApp();
  return wa?.initData ?? '';
}

export async function tgHeaders(): Promise<Record<string, string>> {
  const d = await initData();
  return d ? { authorization: `tma ${d}` } : {};
}

function safeStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function storageGet(key: string, kind: 'local' | 'session' = 'local'): string | null {
  try {
    return safeStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string, kind: 'local' | 'session' = 'local') {
  try {
    safeStorage(kind)?.setItem(key, value);
  } catch {
    /* приватный режим и т. п. */
  }
}

/** Случайный идентификатор браузера для обезличенной статистики. */
export function visitorId(): string {
  let id = storageGet('bm_vid');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
    storageSet('bm_vid', id);
  }
  return id;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** Метки UTM сохраняются при первом заходе (first touch) и прикрепляются к заявке. */
export function captureUtm(): void {
  const p = new URLSearchParams(location.search);
  const utm: Utm = {};
  for (const k of UTM_KEYS) {
    const v = p.get(k);
    if (v) utm[k] = v.slice(0, 100);
  }
  if (Object.keys(utm).length && !storageGet('bm_utm')) storageSet('bm_utm', JSON.stringify(utm));
}

export function getUtm(): Utm {
  try {
    return JSON.parse(storageGet('bm_utm') ?? '{}');
  } catch {
    return {};
  }
}

export async function track(type: string, businessId?: number): Promise<void> {
  try {
    const body = JSON.stringify({ type, businessId, initData: await initData(), visitorId: visitorId() });
    await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true });
  } catch {
    /* статистика не должна ломать страницу */
  }
}

export async function fetchSubscription(): Promise<boolean | null> {
  try {
    const r = await fetch('/api/subscription', { headers: await tgHeaders() });
    if (!r.ok) return null;
    return ((await r.json()) as { subscribed: boolean }).subscribed;
  } catch {
    return null;
  }
}

/** Подписка: системный запрос Telegram «разрешить боту писать», затем сохранение на сервере. */
export async function requestSubscribe(): Promise<boolean> {
  const wa = await getWebApp();
  if (!wa) return false;
  const allowed = await new Promise<boolean>((resolve) => {
    try {
      wa.requestWriteAccess((ok) => resolve(!!ok));
    } catch {
      resolve(false);
    }
  });
  if (!allowed) return false;
  const r = await fetch('/api/subscription', { method: 'POST', headers: await tgHeaders() });
  if (r.ok) wa.HapticFeedback?.notificationOccurred('success');
  return r.ok;
}

export async function requestUnsubscribe(): Promise<boolean> {
  const r = await fetch('/api/subscription', { method: 'DELETE', headers: await tgHeaders() });
  return r.ok;
}
