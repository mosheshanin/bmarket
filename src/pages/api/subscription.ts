import type { APIRoute } from 'astro';
import { HttpError, errorResponse, json } from '../../server/http';
import { getTelegramUser } from '../../server/auth';
import { isSubscribed, subscribe, unsubscribe } from '../../server/subscriptions';
import { db, env } from '../../server/site';

/** Подписка на уведомления — только из мини-приложения (initData в заголовке Authorization: tma …). */
async function user(request: Request) {
  const tg = await getTelegramUser(env, request);
  if (!tg) throw new HttpError(401, 'Подписка доступна только в Telegram');
  return tg.user;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const u = await user(request);
    return json({ subscribed: await isSubscribed(db(), u.id) });
  } catch (e) {
    return errorResponse(e);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const u = await user(request);
    await subscribe(db(), u, 'mini_app');
    return json({ subscribed: true });
  } catch (e) {
    return errorResponse(e);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const u = await user(request);
    await unsubscribe(db(), u.id, 'mini_app');
    return json({ subscribed: false });
  } catch (e) {
    return errorResponse(e);
  }
};
