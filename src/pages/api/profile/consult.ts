import type { APIRoute } from 'astro';
import { HttpError, errorResponse, json, readJson } from '../../../server/http';
import { getTelegramUser } from '../../../server/auth';
import { ConsultInput, requestConsult } from '../../../server/profiles';
import { db, env } from '../../../server/site';

/** «Связаться с менеджером» в итоге опроса. Повтор в течение суток не дублирует сообщение в группе. */
export const POST: APIRoute = async ({ request }) => {
  try {
    const tg = await getTelegramUser(env, request);
    if (!tg) throw new HttpError(401, 'Доступно только в Telegram');
    const { phone } = await readJson(request, ConsultInput);
    return json(await requestConsult(env, db(), tg.user, phone));
  } catch (e) {
    return errorResponse(e);
  }
};
