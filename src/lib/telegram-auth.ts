import { hmacSha256, toHex, safeEqual } from './crypto';

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  allows_write_to_pm?: boolean;
}

export interface InitData {
  user: TgUser;
  authDate: number;
  startParam?: string;
  raw: string;
}

export const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60;

/**
 * Проверка initData мини-приложения по алгоритму Telegram:
 * secret = HMAC_SHA256(key="WebAppData", msg=bot_token)
 * hash   = hex(HMAC_SHA256(key=secret, msg=data_check_string))
 * data_check_string — все поля, кроме hash, отсортированные по ключу, «key=value» через \n.
 * Данные старше 24 часов отклоняются.
 */
export async function validateInitData(
  initData: string,
  botToken: string,
  opts: { maxAgeSec?: number; now?: number } = {},
): Promise<InitData | null> {
  if (!initData || !botToken) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;

  const pairs: string[] = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = await hmacSha256('WebAppData', botToken);
  const expected = toHex(await hmacSha256(secret, dataCheckString));
  if (!safeEqual(expected, hash.toLowerCase())) return null;

  const authDate = Number(params.get('auth_date'));
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const maxAge = opts.maxAgeSec ?? INIT_DATA_MAX_AGE_SEC;
  if (!Number.isFinite(authDate) || authDate <= 0 || now - authDate > maxAge) return null;

  let user: TgUser;
  try {
    user = JSON.parse(params.get('user') ?? '');
  } catch {
    return null;
  }
  if (!user || typeof user.id !== 'number') return null;

  return { user, authDate, startParam: params.get('start_param') ?? undefined, raw: initData };
}

/** Заголовок «Authorization: tma <initData>». */
export function initDataFromHeader(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('tma ') ? h.slice(4) : null;
}

export function parseAdminIds(list: string | undefined): Set<number> {
  return new Set(
    (list ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
}

/** Для тестов и локальной разработки: собрать подписанную строку initData. */
export async function signInitData(fields: Record<string, string>, botToken: string): Promise<string> {
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort();
  const secret = await hmacSha256('WebAppData', botToken);
  const hash = toHex(await hmacSha256(secret, pairs.join('\n')));
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}
