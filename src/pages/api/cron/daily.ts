import type { APIRoute } from 'astro';
import { db, env } from '../../../server/site';
import { json, errorResponse } from '../../../server/http';
import { cronAuthorized, runDaily } from '../../../server/jobs';

/** Задача по расписанию — см. src/server/jobs.ts. */
export const GET: APIRoute = async ({ request }) => {
  try {
    if (!(await cronAuthorized(env, request, db()))) return json({ error: 'Forbidden' }, { status: 403 });
    return json({ ok: true, ...(await runDaily(env, db())) });
  } catch (e) {
    return errorResponse(e);
  }
};

export const POST = GET;
