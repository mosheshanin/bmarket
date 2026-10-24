import type { APIRoute } from 'astro';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { businesses, leads, CONTACT_METHODS } from '../../db/schema';
import { normalizePhone } from '../../lib/format';
import { sha256Hex } from '../../lib/crypto';
import { HttpError, clientIp, errorResponse, json, readJson } from '../../server/http';
import { getTelegramUser, isAdminId } from '../../server/auth';
import { deliverLead, isRateLimited } from '../../server/leads';
import { recordEvent } from '../../server/events';
import { db, env } from '../../server/site';
import { appSecret } from '../../server/secrets';

const utmValue = z.string().max(100).optional();
const LeadInput = z.object({
  businessId: z.number().int().positive(),
  name: z.string().trim().min(2, 'от 2 символов').max(60, 'до 60 символов'),
  phone: z.string().trim().min(5).max(30),
  preferredContact: z.enum(CONTACT_METHODS),
  comment: z.string().trim().max(500, 'до 500 символов').optional(),
  consent: z.literal(true, { error: 'нужно согласие с политикой конфиденциальности' }),
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
  initData: z.string().max(8192).optional(),
  utm: z
    .object({ utm_source: utmValue, utm_medium: utmValue, utm_campaign: utmValue, utm_content: utmValue, utm_term: utmValue })
    .partial()
    .optional(),
  visitorId: z.string().max(64).optional(),
});

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true; // не настроен (локальная разработка)
  if (!token) return false;
  const form = new FormData();
  form.set('secret', env.TURNSTILE_SECRET_KEY);
  form.set('response', token);
  form.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = (await r.json().catch(() => ({}))) as { success?: boolean };
  return !!data.success;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const input = await readJson(request, LeadInput);
    // Ловушка заполнена — молча «принимаем» и выбрасываем.
    if (input.website) return json({ ok: true });

    const tg = input.initData ? await getTelegramUser(env, request, input.initData) : null;
    const source = tg ? 'mini_app' : 'web';
    const ip = clientIp(request);
    // В мини-приложении Turnstile не нужен: запрос подписан Telegram.
    if (!tg && !(await verifyTurnstile(input.turnstileToken, ip))) {
      throw new HttpError(400, 'Проверка «не робот» не пройдена. Обновите страницу и попробуйте ещё раз.');
    }
    const phone = normalizePhone(input.phone);
    if (!phone) throw new HttpError(400, 'Телефон в формате 05X-XXX-XXXX или международный с «+»');

    const d = db();
    const [b] = await d.select({ id: businesses.id, status: businesses.status }).from(businesses).where(eq(businesses.id, input.businessId));
    if (!b || b.status !== 'published') throw new HttpError(404, 'Объявление не найдено или снято с продажи');

    const ipHash = (await sha256Hex(`${await appSecret(env)}:ip:${ip}`)).slice(0, 32);
    if (await isRateLimited(d, ipHash, tg?.user.id ?? null)) {
      throw new HttpError(429, 'Слишком много заявок за час. Попробуйте позже или напишите нам в Telegram.');
    }

    const now = Date.now();
    const [lead] = await d
      .insert(leads)
      .values({
        createdAt: now,
        updatedAt: now,
        businessId: b.id,
        name: input.name,
        phone,
        preferredContact: input.preferredContact,
        comment: input.comment || null,
        telegramUserId: tg?.user.id ?? null,
        telegramUsername: tg?.user.username ?? null,
        source,
        utmSource: input.utm?.utm_source ?? null,
        utmMedium: input.utm?.utm_medium ?? null,
        utmCampaign: input.utm?.utm_campaign ?? null,
        utmContent: input.utm?.utm_content ?? null,
        utmTerm: input.utm?.utm_term ?? null,
        consentAt: now,
        ipHash,
      })
      .returning({ id: leads.id });

    if (!isAdminId(env, tg?.user.id)) {
      const visitorKey = tg ? `tg:${tg.user.id}` : `web:${input.visitorId ?? ipHash}`;
      await recordEvent(d, { type: 'lead_submit', source, visitorKey, businessId: b.id }, now);
    }
    // Заявка уже сохранена; отправка в Telegram — в фоне, с повторами.
    locals.cfContext.waitUntil(deliverLead(env, d, lead.id));
    return json({ ok: true, id: lead.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
};
