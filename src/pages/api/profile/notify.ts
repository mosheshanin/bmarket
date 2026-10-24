import type { APIRoute } from 'astro';
import { z } from 'zod';
import { HttpError, errorResponse, json, readJson } from '../../../server/http';
import { getTelegramUser } from '../../../server/auth';
import { setNotifyMatching } from '../../../server/profiles';
import { db, env } from '../../../server/site';

/** Уведомления «только о подходящих» (подписка на бота — отдельно, /api/subscription). */
export const POST: APIRoute = async ({ request }) => {
  try {
    const tg = await getTelegramUser(env, request);
    if (!tg) throw new HttpError(401, 'Доступно только в Telegram');
    const { on } = await readJson(request, z.object({ on: z.boolean() }));
    await setNotifyMatching(db(), tg.user.id, on);
    return json({ notifyMatching: on });
  } catch (e) {
    return errorResponse(e);
  }
};
