import type { APIRoute } from 'astro';
import { z } from 'zod';
import { errorResponse, json, readJson } from '../../server/http';
import { getTelegramUser, isAdminId } from '../../server/auth';
import { recordEvent } from '../../server/events';
import { db, env } from '../../server/site';

// lead_submit и subscribe/unsubscribe пишет сервер сам — с клиента принимаются только эти.
const Input = z.object({
  type: z.enum(['app_open', 'listing_view', 'lead_form_open']),
  businessId: z.number().int().positive().optional(),
  initData: z.string().max(8192).optional(),
  visitorId: z.string().min(8).max(64).optional(),
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const input = await readJson(request, Input);
    const tg = input.initData ? await getTelegramUser(env, request, input.initData) : null;
    // Просмотры администраторов не учитываются.
    if (tg && isAdminId(env, tg.user.id)) return json({ ok: true, skipped: 'admin' });
    if (!tg && !input.visitorId) return json({ ok: true, skipped: 'anonymous' });
    if (input.type !== 'app_open' && !input.businessId) return json({ ok: true, skipped: 'no business' });
    const recorded = await recordEvent(db(), {
      type: input.type,
      source: tg ? 'mini_app' : 'web',
      visitorKey: tg ? `tg:${tg.user.id}` : `web:${input.visitorId}`,
      businessId: input.businessId ?? null,
    });
    return json({ ok: true, recorded });
  } catch (e) {
    return errorResponse(e);
  }
};
