import type { APIRoute } from 'astro';
import { errorResponse, json } from '../../../server/http';
import { surveyFacets } from '../../../server/profiles';
import { db, env } from '../../../server/site';

/** Справочники, публичные данные лотов и обезличенный спрос — для экрана опроса. */
export const GET: APIRoute = async () => {
  try {
    return json(await surveyFacets(env, db()), { headers: { 'cache-control': 'private, max-age=60' } });
  } catch (e) {
    return errorResponse(e);
  }
};
