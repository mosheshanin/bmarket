import { validateInitData, initDataFromHeader, parseAdminIds, type InitData, type TgUser } from '../lib/telegram-auth';
import { HttpError } from './http';

export interface AdminContext {
  id: number;
  name: string;
  user: TgUser;
}

export function displayName(u: TgUser): string {
  if (u.username) return '@' + u.username;
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || String(u.id);
}

export function isAdminId(env: Env, id: number | undefined | null): boolean {
  return !!id && parseAdminIds(env.ADMIN_TELEGRAM_IDS).has(id);
}

/** initData из заголовка Authorization: tma … (или из явно переданной строки). */
export async function getTelegramUser(env: Env, req: Request, raw?: string | null): Promise<InitData | null> {
  const initData = raw ?? initDataFromHeader(req);
  if (!initData) return null;
  return validateInitData(initData, env.TELEGRAM_BOT_TOKEN);
}

/**
 * Защита админ-API: подпись initData + Telegram ID из ADMIN_TELEGRAM_IDS.
 * Без валидной подписи — 401, не администратор — 403.
 */
export async function requireAdmin(env: Env, req: Request): Promise<AdminContext> {
  const data = await getTelegramUser(env, req);
  if (!data) throw new HttpError(401, 'Нужен вход через Telegram');
  if (!isAdminId(env, data.user.id)) throw new HttpError(403, 'Доступ запрещён');
  return { id: data.user.id, name: displayName(data.user), user: data.user };
}
