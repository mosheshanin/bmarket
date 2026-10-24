import { hmacSha256, toHex } from '../lib/crypto';

/**
 * Секрет вебхука и соль для хешей. Если TELEGRAM_WEBHOOK_SECRET не задан —
 * выводится из токена бота (HMAC), чтобы в Cloudflare хватало одного секрета TELEGRAM_BOT_TOKEN.
 * При перевыпуске токена секрет меняется сам, а бот перенастраивает вебхук при следующем запуске cron.
 */
const cache = new Map<string, Promise<string>>();

export function appSecret(env: Pick<Env, 'TELEGRAM_BOT_TOKEN'> & { TELEGRAM_WEBHOOK_SECRET?: string }): Promise<string> {
  if (env.TELEGRAM_WEBHOOK_SECRET) return Promise.resolve(env.TELEGRAM_WEBHOOK_SECRET);
  const token = env.TELEGRAM_BOT_TOKEN ?? '';
  // Токен ещё не задан — сайт всё равно должен работать (вебхук при этом закрыт: см. webhook.ts).
  if (!token) return Promise.resolve('bmarket:no-bot-token');
  let p = cache.get(token);
  if (!p) {
    p = hmacSha256(token, 'bmarket:webhook').then((b) => toHex(b).slice(0, 48));
    cache.set(token, p);
  }
  return p;
}
