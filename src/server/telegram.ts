import { Api, GrammyError } from 'grammy';
import { imageUrl } from './public';

export function tgApi(env: Env): Api {
  return new Api(env.TELEGRAM_BOT_TOKEN);
}

export function isBlockedError(e: unknown): boolean {
  return e instanceof GrammyError && (e.error_code === 403 || /chat not found|user is deactivated/i.test(e.description));
}

export function retryAfterSec(e: unknown): number | null {
  if (e instanceof GrammyError && e.error_code === 429) return e.parameters?.retry_after ?? 1;
  return null;
}

export function siteUrl(env: Env): string {
  return (env.SITE_URL || '').replace(/\/$/, '');
}

/** Абсолютный адрес фото — Telegram скачивает его сам. */
export function absoluteImageUrl(env: Env, key: string): string {
  const u = imageUrl(env, key);
  return u.startsWith('http') ? u : siteUrl(env) + u;
}

/** Прямая ссылка в мини-приложение: https://t.me/<бот>/<приложение>?startapp=lot-1001 */
export function miniAppLink(env: Env, startParam?: string): string | null {
  if (!env.TELEGRAM_BOT_USERNAME) return null;
  const base = `https://t.me/${env.TELEGRAM_BOT_USERNAME}/${env.TELEGRAM_APP_SHORT_NAME || 'app'}`;
  return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
}

export function botLink(env: Env, start?: string): string | null {
  if (!env.TELEGRAM_BOT_USERNAME) return null;
  return `https://t.me/${env.TELEGRAM_BOT_USERNAME}${start ? `?start=${encodeURIComponent(start)}` : ''}`;
}

export function managersChatId(env: Env): string | null {
  return env.MANAGERS_CHAT_ID ? String(env.MANAGERS_CHAT_ID) : null;
}

export async function notifyManagers(env: Env, html: string): Promise<void> {
  const chat = managersChatId(env);
  if (!chat || !env.TELEGRAM_BOT_TOKEN) return;
  try {
    await tgApi(env).sendMessage(chat, html, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
  } catch (e) {
    console.error('notifyManagers failed', e);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
