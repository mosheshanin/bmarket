import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db, env } from '../../server/site';
import { buildVersion, databaseUrl } from '../../server/env';
import { json } from '../../server/http';

/**
 * Проверка работоспособности (мониторинг, проверка после деплоя): доступна ли база.
 * Наружу — только код ошибки (ENOTFOUND, 28P01 — неверный пароль, XX000 — «Tenant or user not found» и т. п.),
 * без строки подключения и текста ошибки.
 */
export const GET: APIRoute = async () => {
  const started = Date.now();
  let dbState: Record<string, unknown>;
  if (!databaseUrl(env)) dbState = { ok: false, code: 'DATABASE_URL_MISSING' };
  else {
    try {
      await db().execute(sql`select 1`);
      dbState = { ok: true, ms: Date.now() - started };
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string; message?: string } };
      const code = err.cause?.code ?? err.code ?? 'UNKNOWN';
      console.error('health: db error', code, err.cause?.message?.slice(0, 200));
      dbState = { ok: false, code };
    }
  }
  return json(
    { ok: dbState.ok === true, db: dbState, storage: !!env.SUPABASE_URL && !!(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY), version: buildVersion(env) },
    { status: dbState.ok ? 200 : 503 },
  );
};
