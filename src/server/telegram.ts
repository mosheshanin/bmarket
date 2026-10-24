import { Api, GrammyError } from 'grammy';
import type { Message } from 'grammy/types';
import type { DB } from '../db/client';
import { imageUrl } from './public';
import { deleteSetting, getSetting, setSetting } from './settings';

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

/** ID группы из настроек wrangler.jsonc (без учёта автоматической замены). */
export function managersChatId(env: Env): string | null {
  return env.MANAGERS_CHAT_ID ? String(env.MANAGERS_CHAT_ID) : null;
}

/** Актуальный ID группы менеджеров: замена из `settings` (переход в супергруппу, /setgroup) важнее переменной. */
export async function getManagersChat(env: Env, db: DB): Promise<string | null> {
  return (await getSetting(db, MANAGERS_CHAT_KEY)) ?? managersChatId(env);
}

export const MANAGERS_CHAT_KEY = 'managers_chat_id';
export const MANAGERS_ERROR_KEY = 'managers_last_error';

/** Понятное описание ошибки Telegram для администратора. */
export function describeTgError(e: unknown): string {
  if (!(e instanceof GrammyError)) return e instanceof Error ? e.message : String(e);
  const d = e.description;
  if (e.error_code === 401) return 'Telegram не принял токен бота — проверьте секрет TELEGRAM_BOT_TOKEN.';
  if (/chat not found/i.test(d)) return 'Группа не найдена: бот не добавлен в группу или ID группы неверный. Добавьте бота в группу и напишите там /setgroup.';
  if (/kicked|not a member|bot is not a member/i.test(d)) return 'Бот не состоит в группе (или его удалили). Добавьте бота в группу и напишите там /setgroup.';
  if (/not enough rights|have no rights|CHAT_WRITE_FORBIDDEN|CHAT_RESTRICTED/i.test(d)) return 'У бота нет права писать в группе — разрешите ему отправлять сообщения.';
  if (/upgraded to a supergroup/i.test(d)) return 'Группа стала супергруппой — ID обновится автоматически, повторите отправку.';
  return `Telegram: ${e.error_code} ${d}`;
}

/**
 * Отправка в группу менеджеров. Если группа стала супергруппой, Telegram сообщает новый ID —
 * он сохраняется в `settings`, и отправка повторяется. Последняя ошибка хранится для админки.
 */
export async function sendToManagers(env: Env, db: DB, text: string, other: Parameters<Api['sendMessage']>[2] = {}): Promise<Message.TextMessage> {
  let chat = await getManagersChat(env, db);
  if (!chat || !env.TELEGRAM_BOT_TOKEN) {
    const err = !env.TELEGRAM_BOT_TOKEN ? 'Не задан токен бота (TELEGRAM_BOT_TOKEN).' : 'Не задан ID группы менеджеров (MANAGERS_CHAT_ID).';
    await setSetting(db, MANAGERS_ERROR_KEY, JSON.stringify({ at: Date.now(), error: err }));
    throw new Error(err);
  }
  for (let hop = 0; hop < 2; hop++) {
    try {
      const msg = await tgApi(env).sendMessage(chat, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...other });
      if (hop > 0 || (await getSetting(db, MANAGERS_ERROR_KEY))) await deleteSetting(db, MANAGERS_ERROR_KEY);
      return msg;
    } catch (e) {
      const migrated = e instanceof GrammyError ? e.parameters?.migrate_to_chat_id : undefined;
      if (migrated && hop === 0) {
        console.warn(`managers chat ${chat} migrated to ${migrated}`);
        chat = String(migrated);
        await setSetting(db, MANAGERS_CHAT_KEY, chat);
        continue;
      }
      const error = describeTgError(e);
      console.error('sendToManagers failed:', error, e instanceof GrammyError ? { code: e.error_code, description: e.description, chat } : '');
      await setSetting(db, MANAGERS_ERROR_KEY, JSON.stringify({ at: Date.now(), error, chat }));
      throw Object.assign(new Error(error), { cause: e });
    }
  }
  throw new Error('unreachable');
}

export async function notifyManagers(env: Env, db: DB, html: string): Promise<void> {
  try {
    await sendToManagers(env, db, html);
  } catch {
    // уже записано в журнал и в settings
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
