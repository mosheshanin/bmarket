import type { APIRoute } from 'astro';
import { json } from '../../server/http';
import { getTelegramUser, isAdminId } from '../../server/auth';
import { env } from '../../server/site';

/** Показывать ли кнопку «Админ-панель». Защита при этом — на каждом запросе к /api/admin/*. */
export const GET: APIRoute = async ({ request }) => {
  const tg = await getTelegramUser(env, request);
  return json({ isAdmin: !!tg && isAdminId(env, tg.user.id) });
};
