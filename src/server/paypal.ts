/**
 * PayPal Checkout (Orders API v2) без JS SDK: сервер создаёт заказ, продавец подтверждает оплату
 * на странице PayPal (во внешнем браузере), возвращается на /pay/paypal/return — сервер списывает деньги (capture).
 * Подстраховка: вебхук PayPal и сверка по расписанию (если продавец закрыл вкладку до возврата).
 *
 * Настройки: секреты PAYPAL_CLIENT_ID и PAYPAL_CLIENT_SECRET; переменные PAYPAL_ENV (sandbox | live),
 * PAYPAL_WEBHOOK_ID (ID вебхука из кабинета разработчика PayPal). PAYPAL_API_BASE — только для тестов.
 */

export interface PayPalEnv {
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_ENV?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYPAL_API_BASE?: string;
}

export function paypalConfigured(env: PayPalEnv): boolean {
  return !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
}

export function paypalMode(env: PayPalEnv): 'live' | 'sandbox' {
  return env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}

function apiBase(env: PayPalEnv): string {
  if (env.PAYPAL_API_BASE) return env.PAYPAL_API_BASE.replace(/\/$/, '');
  return paypalMode(env) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

export class PayPalError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

let tokenCache: { key: string; token: string; until: number } | null = null;

async function accessToken(env: PayPalEnv): Promise<string> {
  const key = `${apiBase(env)}|${env.PAYPAL_CLIENT_ID}`;
  if (tokenCache && tokenCache.key === key && tokenCache.until > Date.now()) return tokenCache.token;
  const r = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!r.ok || !data.access_token) throw new PayPalError(r.status, `PayPal: не удалось войти (${data.error_description ?? r.status}) — проверьте PAYPAL_CLIENT_ID/SECRET и PAYPAL_ENV`);
  tokenCache = { key, token: data.access_token, until: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 120) * 1000 };
  return data.access_token;
}

async function call<T>(env: PayPalEnv, method: string, path: string, body?: unknown, requestId?: string): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${await accessToken(env)}`, 'content-type': 'application/json' };
  if (requestId) headers['paypal-request-id'] = requestId;
  const r = await fetch(apiBase(env) + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as T & { message?: string; name?: string; details?: unknown };
  if (!r.ok) throw new PayPalError(r.status, `PayPal ${r.status}: ${data.name ?? ''} ${data.message ?? ''}`.trim(), data.details);
  return data;
}

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  links?: { href: string; rel: string }[];
  purchase_units?: {
    custom_id?: string;
    amount?: { currency_code: string; value: string };
    payments?: { captures?: { id: string; status: string; amount: { currency_code: string; value: string } }[] };
  }[];
}

/** Сумма в агоротах → строка PayPal «199.00». */
export const toPayPalValue = (agorot: number) => (agorot / 100).toFixed(2);
export const fromPayPalValue = (v: string) => Math.round(Number(v) * 100);

export async function createOrder(
  env: PayPalEnv,
  o: { amount: number; currency: string; businessId: number; lotNumber: number; brand: string; returnUrl: string; cancelUrl: string },
): Promise<{ id: string; approveUrl: string }> {
  const order = await call<PayPalOrder>(env, 'POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: `lot-${o.lotNumber}`,
      custom_id: String(o.businessId),
      description: `Размещение объявления №${o.lotNumber}`.slice(0, 127),
      amount: { currency_code: o.currency, value: toPayPalValue(o.amount) },
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: o.brand.slice(0, 127),
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: o.returnUrl,
          cancel_url: o.cancelUrl,
        },
      },
    },
  }, `create-${o.businessId}-${crypto.randomUUID()}`);
  const approveUrl = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  if (!approveUrl) throw new PayPalError(502, 'PayPal не вернул ссылку на оплату');
  return { id: order.id, approveUrl };
}

export const getOrder = (env: PayPalEnv, id: string) => call<PayPalOrder>(env, 'GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);

/** Списание по одобренному заказу. Повторный вызов безопасен (тот же PayPal-Request-Id). */
export async function captureOrder(env: PayPalEnv, id: string): Promise<PayPalOrder> {
  try {
    return await call<PayPalOrder>(env, 'POST', `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, {}, `capture-${id}`);
  } catch (e) {
    // Уже списано (например, вебхуком) — вернуть актуальное состояние заказа.
    if (e instanceof PayPalError && e.status === 422) return getOrder(env, id);
    throw e;
  }
}

/** Итог по заказу: completed / pending / failed / open (ещё не оплачен). */
export function orderOutcome(order: PayPalOrder): { state: 'completed' | 'pending' | 'failed' | 'open' | 'approved'; captureId?: string; amount?: number; currency?: string } {
  const cap = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (cap) {
    const amount = fromPayPalValue(cap.amount.value);
    if (cap.status === 'COMPLETED') return { state: 'completed', captureId: cap.id, amount, currency: cap.amount.currency_code };
    if (cap.status === 'PENDING') return { state: 'pending', captureId: cap.id, amount, currency: cap.amount.currency_code };
    return { state: 'failed', captureId: cap.id };
  }
  if (order.status === 'APPROVED') return { state: 'approved' };
  if (order.status === 'VOIDED') return { state: 'failed' };
  return { state: 'open' };
}

/**
 * Проверка подписи вебхука через API PayPal. Тело события передаётся как есть (строкой),
 * иначе пересериализация JSON ломает проверку.
 */
export async function verifyWebhook(env: PayPalEnv, headers: Headers, rawBody: string): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID) return false;
  const h = (n: string) => JSON.stringify(headers.get(n) ?? '');
  const body = `{"auth_algo":${h('paypal-auth-algo')},"cert_url":${h('paypal-cert-url')},"transmission_id":${h('paypal-transmission-id')},` +
    `"transmission_sig":${h('paypal-transmission-sig')},"transmission_time":${h('paypal-transmission-time')},` +
    `"webhook_id":${JSON.stringify(env.PAYPAL_WEBHOOK_ID)},"webhook_event":${rawBody}}`;
  try {
    const r = await call<{ verification_status?: string }>(env, 'POST', '/v1/notifications/verify-webhook-signature', body);
    return r.verification_status === 'SUCCESS';
  } catch (e) {
    console.error('paypal webhook verify failed', e instanceof Error ? e.message : e);
    return false;
  }
}
