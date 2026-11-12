/**
 * Переменные окружения процесса (Vercel Functions, Node.js) с тем же интерфейсом Env,
 * что раньше давал `cloudflare:workers`. Значения читаются при каждом обращении,
 * поэтому тесты могут подменять process.env.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_t, key: string) => process.env[key] ?? (key in DEFAULTS ? DEFAULTS[key as keyof typeof DEFAULTS] : undefined),
  has: (_t, key: string) => key in process.env || key in DEFAULTS,
});

/** Значения по умолчанию для обязательных строк (раньше — vars в wrangler.jsonc). */
const DEFAULTS = {
  SITE_URL: '',
  PUBLIC_IMAGES_URL: '',
  ADMIN_TELEGRAM_IDS: '',
  MANAGERS_CHAT_ID: '',
  TELEGRAM_BOT_USERNAME: '',
  TELEGRAM_APP_SHORT_NAME: 'app',
  TURNSTILE_SITE_KEY: '',
  CF_ANALYTICS_TOKEN: '',
  PROJECT_NAME: 'BMarket',
  ONLINE_PAYMENTS: '0',
  PAYPAL_ENV: 'sandbox',
  PAYPAL_WEBHOOK_ID: '',
  TELEGRAM_BOT_TOKEN: '',
} satisfies Partial<Env>;

export function databaseUrl(e: Env = env): string {
  return e.DATABASE_URL || e.POSTGRES_URL || '';
}

/** Версия сборки: ID деплоя Vercel (локально — dev). */
export function buildVersion(e: Env = env): string {
  return e.VERCEL_DEPLOYMENT_ID || 'dev';
}
