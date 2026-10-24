import type { APIRoute } from 'astro';
import { webhookCallback } from 'grammy';
import { createBot } from '../../../bot/bot';
import { safeEqual } from '../../../lib/crypto';
import { db, env } from '../../../server/site';

/** Вебхук бота: принимаются только запросы с верным X-Telegram-Bot-Api-Secret-Token. */
export const POST: APIRoute = async ({ request }) => {
  const secret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!env.TELEGRAM_WEBHOOK_SECRET || !safeEqual(secret, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response('Forbidden', { status: 403 });
  }
  const bot = createBot(env, db());
  const handle = webhookCallback(bot, 'std/http', { onTimeout: 'return', timeoutMilliseconds: 9000 });
  return handle(request);
};
