import type { APIRoute } from 'astro';
import { db, env } from '../../../server/site';
import { json, errorResponse } from '../../../server/http';
import { cronAuthorized, runMinute } from '../../../server/jobs';

/** Задача по расписанию — см. src/server/jobs.ts. */
export const GET: APIRoute = async ({ request }) => {
  if (!cronAuthorized(env, request)) return json({ error: 'Forbidden' }, { status: 403 });
  try {
    return json({ ok: true, ...(await runMinute(env, db())) });
  } catch (e) {
    return errorResponse(e);
  }
};

export const POST = GET;
