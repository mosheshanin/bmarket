/// <reference types="astro/client" />
/// <reference path="./scripts/telegram-webapp.d.ts" />

/**
 * Переменные окружения (Vercel → Project → Settings → Environment Variables; локально — .env).
 * Все значения — строки; пустая строка или отсутствие = «не задано».
 */
interface Env {
  // --- База и хранилище (Supabase) ---
  /** Строка подключения к Postgres через пулер (порт 6543). Интеграция Supabase ↔ Vercel задаёт POSTGRES_URL. */
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  /** https://<ref>.supabase.co */
  SUPABASE_URL?: string;
  /** Секретный ключ (sb_secret_… или service_role) — только на сервере. */
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Бакет Supabase Storage для фото (по умолчанию photos). */
  PHOTOS_BUCKET?: string;
  /** Секрет задач по расписанию: /api/cron/* принимают только «Authorization: Bearer <CRON_SECRET>». */
  CRON_SECRET?: string;
  /** Задаёт Vercel: ID деплоя (метка самонастройки бота и версии кеша). */
  VERCEL_DEPLOYMENT_ID?: string;
  /** Задаёт Vercel: адрес деплоя без https:// и окружение (production / preview / development). */
  VERCEL_URL?: string;
  VERCEL_ENV?: string;

  // --- Сайт и бот ---
  SITE_URL: string;
  PUBLIC_IMAGES_URL: string;
  ADMIN_TELEGRAM_IDS: string;
  MANAGERS_CHAT_ID: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_APP_SHORT_NAME: string;
  TURNSTILE_SITE_KEY: string;
  CF_ANALYTICS_TOKEN: string;
  PROJECT_NAME: string;
  ONLINE_PAYMENTS: string;
  PAYPAL_ENV: string;
  PAYPAL_WEBHOOK_ID: string;
  // --- Секреты ---
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_API_BASE?: string;
}
