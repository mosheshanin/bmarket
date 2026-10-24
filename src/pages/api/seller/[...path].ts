import type { APIContext, APIRoute } from 'astro';
import { z } from 'zod';
import type { TgUser } from '../../../lib/telegram-auth';
import { getTelegramUser } from '../../../server/auth';
import { HttpError, errorResponse, json, readJson } from '../../../server/http';
import { listDicts } from '../../../server/admin/dicts';
import {
  EditRequestInput, SellerInput, backToEditing, createEditRequest, createSellerDraft, deleteSellerDraft, getSellerSettings,
  listOwn, ownDetail, paymentInfo, sellerAddPhoto, sellerReorderPhotos, sellerUpdatePhoto, startPayPal, submitSellerDraft,
  updateSellerDraft,
} from '../../../server/seller';
import { PayPalError } from '../../../server/paypal';
import { db, env } from '../../../server/site';

/**
 * API продавца (страница /sell). Вход — только через Telegram (подпись initData),
 * каждый запрос работает только с объявлениями этого пользователя.
 */
type Ctx = { ctx: APIContext; user: TgUser; params: string[]; origin: string };
type Handler = (c: Ctx) => Promise<Response>;

const Ids = z.object({ ids: z.array(z.number().int().positive()).max(50) });
const PhotoPatch = z.object({ alt: z.string().max(200).nullable().optional(), delete: z.boolean().optional() });

const num = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Неверный идентификатор');
  return n;
};

const routes: [string, RegExp, Handler][] = [
  ['GET', /^me$/, async ({ user }) => {
    const d = db();
    const [items, dicts, settings] = await Promise.all([listOwn(env, d, user), listDicts(d), getSellerSettings(d)]);
    return json({
      user: { id: user.id, firstName: user.first_name, username: user.username ?? null },
      items,
      cities: dicts.cities.map((c) => ({ id: c.id, name: c.name })),
      categories: dicts.categories.map((c) => ({ id: c.id, name: c.name })),
      priceIls: settings.priceIls,
      autoPublish: settings.autoPublish,
      payment: paymentInfo(env),
    });
  }],
  ['POST', /^businesses$/, async ({ user }) => json(await createSellerDraft(env, db(), user), { status: 201 })],
  ['GET', /^businesses\/(\d+)$/, async ({ user, params }) => json(await ownDetail(env, db(), user, num(params[0])))],
  ['PUT', /^businesses\/(\d+)$/, async ({ ctx, user, params, origin }) =>
    json(await updateSellerDraft(env, db(), user, num(params[0]), await readJson(ctx.request, SellerInput), origin))],
  ['DELETE', /^businesses\/(\d+)$/, async ({ user, params }) => {
    await deleteSellerDraft(db(), user, num(params[0]));
    return json({ ok: true });
  }],
  ['POST', /^businesses\/(\d+)\/photos$/, async ({ ctx, user, params, origin }) =>
    json(await sellerAddPhoto(env, db(), user, num(params[0]), await ctx.request.formData(), origin), { status: 201 })],
  ['PUT', /^businesses\/(\d+)\/photos\/order$/, async ({ ctx, user, params, origin }) =>
    json(await sellerReorderPhotos(env, db(), user, num(params[0]), (await readJson(ctx.request, Ids)).ids, origin))],
  ['PATCH', /^photos\/(\d+)$/, async ({ ctx, user, params, origin }) =>
    json(await sellerUpdatePhoto(env, db(), user, num(params[0]), await readJson(ctx.request, PhotoPatch), origin))],
  ['POST', /^businesses\/(\d+)\/submit$/, async ({ user, params }) => json(await submitSellerDraft(env, db(), user, num(params[0])))],
  ['POST', /^businesses\/(\d+)\/edit$/, async ({ user, params }) => json(await backToEditing(env, db(), user, num(params[0])))],
  ['POST', /^businesses\/(\d+)\/pay$/, async ({ user, params }) => {
    try {
      return json(await startPayPal(env, db(), user, num(params[0])));
    } catch (e) {
      if (e instanceof PayPalError) {
        console.error('paypal create order', e.message, e.details);
        throw new HttpError(502, 'PayPal временно недоступен — попробуйте через несколько минут');
      }
      throw e;
    }
  }],
  ['POST', /^businesses\/(\d+)\/edit-requests$/, async ({ ctx, user, params }) =>
    json(await createEditRequest(env, db(), user, num(params[0]), (await readJson(ctx.request, EditRequestInput)).text), { status: 201 })],
];

const handler: APIRoute = async (ctx) => {
  try {
    if (!env.TELEGRAM_BOT_TOKEN) throw new HttpError(503, 'Размещение объявлений временно недоступно');
    const data = await getTelegramUser(env, ctx.request);
    if (!data) throw new HttpError(401, 'Откройте страницу в Telegram, через бота');
    const path = (ctx.params.path ?? '').replace(/^\/+|\/+$/g, '');
    const url = new URL(ctx.request.url);
    for (const [method, re, h] of routes) {
      if (method !== ctx.request.method) continue;
      const m = re.exec(path);
      if (m) return await h({ ctx, user: data.user, params: m.slice(1), origin: url.origin });
    }
    throw new HttpError(404, 'Метод не найден');
  } catch (e) {
    return errorResponse(e);
  }
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
