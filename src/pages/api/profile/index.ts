import type { APIRoute } from 'astro';
import { HttpError, errorResponse, json, readJson } from '../../../server/http';
import { getTelegramUser } from '../../../server/auth';
import { ProfileInput, getProfile, openSellerListing, ownProfile, saveProfile, surveyEnabled } from '../../../server/profiles';
import { db, env } from '../../../server/site';

/** Ответы опроса пользователя мини-приложения (initData в заголовке Authorization: tma …). */
async function user(request: Request) {
  const tg = await getTelegramUser(env, request);
  if (!tg) throw new HttpError(401, 'Доступно только в Telegram');
  return tg.user;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const u = await user(request);
    const d = db();
    const [p, enabled, openListing] = await Promise.all([getProfile(d, u.id), surveyEnabled(d), openSellerListing(d, u.id)]);
    return json({ surveyEnabled: enabled, profile: ownProfile(p), openListing });
  } catch (e) {
    return errorResponse(e);
  }
};

export const PUT: APIRoute = async ({ request }) => {
  try {
    const u = await user(request);
    const p = await saveProfile(db(), u, await readJson(request, ProfileInput));
    return json({ profile: ownProfile(p) });
  } catch (e) {
    return errorResponse(e);
  }
};
