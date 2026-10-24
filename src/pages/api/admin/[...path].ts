import type { APIContext, APIRoute } from 'astro';
import { z } from 'zod';
import { LEAD_STATUSES } from '../../../db/schema';
import { signToken, verifyToken } from '../../../lib/crypto';
import { israelDateIso } from '../../../lib/format';
import { HttpError, errorResponse, json, readJson } from '../../../server/http';
import { requireAdmin, type AdminContext } from '../../../server/auth';
import {
  BusinessInput, addPhoto, businessDetail, createBusiness, deleteDraft, duplicateBusiness, hideBusiness,
  listBusinesses, publishBusiness, reorderPhotos, updateBusiness, updatePhoto,
} from '../../../server/admin/businesses';
import { leadDetail, leadsCsv, leadsSummary, listLeads, patchLead, sendCsvToAdmin, syncLeadMessage } from '../../../server/admin/leads';
import { CategoryInput, CityInput, createCategory, createCity, deleteDict, listDicts, reorderDict, updateCategory, updateCity } from '../../../server/admin/dicts';
import { getStats, subscribersSummary } from '../../../server/admin/stats';
import { deliverLead, managersStatus, undeliveredLeadIds } from '../../../server/leads';
import {
  MarkPaidInput, ResolveInput, ReturnInput, SellerSettingsInput, adminSellerInfo, getSellerSettings, markPaidManually,
  openEditRequests, paymentInfo, resolveEditRequest, returnToSeller, saveSellerSettings, sellerQueue,
} from '../../../server/seller';
import { sendToManagers } from '../../../server/telegram';
import { escapeHtml } from '../../../lib/format';
import { db, env, site } from '../../../server/site';

type Ctx = { ctx: APIContext; admin: AdminContext; params: string[]; url: URL; origin: string };
type Handler = (c: Ctx) => Promise<Response>;

const Ids = z.object({ ids: z.array(z.number().int().positive()).max(500) });
const PublishInput = z.object({ notify: z.boolean().default(true) });
const LeadPatch = z.object({ status: z.enum(LEAD_STATUSES).optional(), adminNote: z.string().max(2000).nullable().optional() });
const PhotoPatch = z.object({ alt: z.string().max(200).nullable().optional(), delete: z.boolean().optional() });

const exportSecret = () => `csv:${env.TELEGRAM_BOT_TOKEN}`;

function range(url: URL) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const f = from ? Date.parse(from + 'T00:00:00+03:00') : 0;
  const t = to ? Date.parse(to + 'T23:59:59+03:00') : Date.now();
  if (Number.isNaN(f) || Number.isNaN(t)) throw new HttpError(400, 'Неверный период');
  return { from: f, to: t, name: `leads_${from || 'all'}_${to || israelDateIso()}.csv` };
}

/** Подписанная ссылка хранит период и имя файла: «from-to-name». */
function exportPayload(r: { from: number; to: number; name: string }) {
  return `${r.from}-${r.to}-${r.name}`;
}

const num = (s: string) => {
  const n = Number(s);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Неверный идентификатор');
  return n;
};

/** Карточка лота в админке + блок продавца (оплата, запросы на изменение). */
async function full(id: number) {
  const d = db();
  const detail = await businessDetail(env, d, id);
  return { ...detail, seller: await adminSellerInfo(d, detail.business) };
}

const routes: [string, RegExp, Handler][] = [
  ['GET', /^me$/, async ({ admin }) => {
    const d = db();
    const [dicts, summary, seller] = await Promise.all([listDicts(d), leadsSummary(d), sellerQueue(d)]);
    return json({ admin: { id: admin.id, name: admin.name }, ...dicts, leadsSummary: summary, sellerQueue: seller, site: site() });
  }],

  // ---- Объявления ----
  ['GET', /^businesses$/, async ({ url }) => json({ items: await listBusinesses(env, db(), url.searchParams.get('status') ?? undefined) })],
  ['POST', /^businesses$/, async ({ ctx, admin }) => {
    const input = await readJson(ctx.request, BusinessInput);
    const b = await createBusiness(db(), admin, input);
    return json(await full(b.id), { status: 201 });
  }],
  ['GET', /^businesses\/(\d+)$/, async ({ params }) => json(await full(num(params[0])))],
  ['PUT', /^businesses\/(\d+)$/, async ({ ctx, admin, params, origin }) => {
    const input = await readJson(ctx.request, BusinessInput);
    await updateBusiness(env, db(), admin, num(params[0]), input, origin);
    return json(await full(num(params[0])));
  }],
  ['DELETE', /^businesses\/(\d+)$/, async ({ admin, params }) => {
    await deleteDraft(db(), admin, num(params[0]));
    return json({ ok: true });
  }],
  ['POST', /^businesses\/(\d+)\/publish$/, async ({ ctx, admin, params, origin }) => {
    const { notify } = await readJson(ctx.request, PublishInput);
    const r = await publishBusiness(env, db(), admin, num(params[0]), notify, origin);
    return json({ ...(await full(num(params[0]))), notificationQueued: r.notificationQueued });
  }],
  ['POST', /^businesses\/(\d+)\/hide$/, async ({ admin, params, origin }) => {
    await hideBusiness(env, db(), admin, num(params[0]), origin);
    return json(await full(num(params[0])));
  }],
  ['POST', /^businesses\/(\d+)\/duplicate$/, async ({ admin, params }) => {
    const copy = await duplicateBusiness(env, db(), admin, num(params[0]));
    return json(await full(copy.id), { status: 201 });
  }],
  ['POST', /^businesses\/(\d+)\/photos$/, async ({ ctx, admin, params, origin }) => {
    const form = await ctx.request.formData();
    return json(await addPhoto(env, db(), admin, num(params[0]), form, origin), { status: 201 });
  }],
  ['PUT', /^businesses\/(\d+)\/photos\/order$/, async ({ ctx, admin, params, origin }) => {
    const { ids } = await readJson(ctx.request, Ids);
    await reorderPhotos(env, db(), admin, num(params[0]), ids, origin);
    return json(await full(num(params[0])));
  }],
  ['PATCH', /^photos\/(\d+)$/, async ({ ctx, admin, params, origin }) => {
    const patch = await readJson(ctx.request, PhotoPatch);
    const b = await updatePhoto(env, db(), admin, num(params[0]), patch, origin);
    return json(await full(b.id));
  }],

  // ---- Объявления продавцов ----
  ['GET', /^seller$/, async () => {
    const d = db();
    const [settings, queue, requests] = await Promise.all([getSellerSettings(d), sellerQueue(d), openEditRequests(d)]);
    return json({ settings, queue, requests, payment: paymentInfo(env) });
  }],
  ['PUT', /^seller\/settings$/, async ({ ctx }) => json({ settings: await saveSellerSettings(db(), await readJson(ctx.request, SellerSettingsInput)) })],
  ['POST', /^businesses\/(\d+)\/mark-paid$/, async ({ ctx, admin, params }) => {
    await markPaidManually(env, db(), admin, num(params[0]), (await readJson(ctx.request, MarkPaidInput)).note);
    return json(await full(num(params[0])));
  }],
  ['POST', /^businesses\/(\d+)\/return-to-seller$/, async ({ ctx, admin, params }) => {
    await returnToSeller(env, db(), admin, num(params[0]), (await readJson(ctx.request, ReturnInput)).comment);
    return json(await full(num(params[0])));
  }],
  ['PATCH', /^edit-requests\/(\d+)$/, async ({ ctx, admin, params }) => {
    const { status, adminNote } = await readJson(ctx.request, ResolveInput);
    const r = await resolveEditRequest(env, db(), admin, num(params[0]), status, adminNote);
    return json(await full(r.businessId));
  }],

  // ---- Заявки ----
  ['GET', /^leads$/, async ({ url }) => {
    const d = db();
    const businessId = url.searchParams.get('businessId');
    const [items, summary] = await Promise.all([
      listLeads(d, { status: url.searchParams.get('status') ?? undefined, businessId: businessId ? num(businessId) : undefined }),
      leadsSummary(d),
    ]);
    return json({ items, summary });
  }],
  ['GET', /^leads\/(\d+)$/, async ({ params }) => json(await leadDetail(db(), num(params[0])))],
  ['PATCH', /^leads\/(\d+)$/, async ({ ctx, admin, params }) => {
    const patch = await readJson(ctx.request, LeadPatch);
    const d = db();
    const r = await patchLead(env, d, admin, num(params[0]), patch);
    // Статус в админке ↔ сообщение в группе менеджеров.
    if (r.statusChanged) ctx.locals.cfContext.waitUntil(syncLeadMessage(env, d, r.lead.id));
    return json(await leadDetail(d, r.lead.id));
  }],
  ['POST', /^leads\/(\d+)\/resend$/, async ({ params }) => {
    const r = await deliverLead(env, db(), num(params[0]), [1000]);
    if (!r.ok) throw new HttpError(502, r.error || 'Telegram не принял сообщение');
    return json(await leadDetail(db(), num(params[0])));
  }],

  // ---- Группа менеджеров: проверка и повторная отправка ----
  ['GET', /^telegram\/status$/, async () => json(await managersStatus(env, db()))],
  ['POST', /^telegram\/test$/, async ({ admin }) => {
    const d = db();
    try {
      await sendToManagers(env, d, `✅ Проверка связи: бот пишет в эту группу. Запустил ${escapeHtml(admin.name)}.`);
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : String(e));
    }
    return json(await managersStatus(env, d));
  }],
  ['POST', /^telegram\/resend-undelivered$/, async () => {
    const d = db();
    const ids = await undeliveredLeadIds(d);
    let sent = 0;
    let error = '';
    for (const id of ids) {
      const r = await deliverLead(env, d, id, []);
      if (r.ok) sent++;
      else { error = r.error ?? ''; break; }
    }
    return json({ sent, total: ids.length, error, status: await managersStatus(env, d) });
  }],
  ['POST', /^leads\/export-link$/, async ({ url }) => {
    const r = range(url);
    const token = await signToken(exportSecret(), exportPayload(r), 300);
    return json({ url: `/api/admin/leads/export?token=${encodeURIComponent(token)}`, filename: r.name });
  }],
  ['POST', /^leads\/export-send$/, async ({ url, admin }) => {
    const r = range(url);
    await sendCsvToAdmin(env, admin.id, await leadsCsv(db(), r.from, r.to), r.name);
    return json({ ok: true });
  }],

  // ---- Справочники ----
  ['GET', /^dicts$/, async () => json(await listDicts(db()))],
  ['POST', /^cities$/, async ({ ctx }) => json(await createCity(db(), await readJson(ctx.request, CityInput)), { status: 201 })],
  ['PUT', /^cities\/order$/, async ({ ctx }) => {
    await reorderDict(db(), 'city', (await readJson(ctx.request, Ids)).ids);
    return json(await listDicts(db()));
  }],
  ['PUT', /^cities\/(\d+)$/, async ({ ctx, params, origin }) =>
    json(await updateCity(env, db(), num(params[0]), await readJson(ctx.request, CityInput.partial()), origin))],
  ['DELETE', /^cities\/(\d+)$/, async ({ params }) => {
    await deleteDict(db(), 'city', num(params[0]));
    return json({ ok: true });
  }],
  ['POST', /^categories$/, async ({ ctx }) => json(await createCategory(db(), await readJson(ctx.request, CategoryInput)), { status: 201 })],
  ['PUT', /^categories\/order$/, async ({ ctx }) => {
    await reorderDict(db(), 'category', (await readJson(ctx.request, Ids)).ids);
    return json(await listDicts(db()));
  }],
  ['PUT', /^categories\/(\d+)$/, async ({ ctx, params, origin }) =>
    json(await updateCategory(env, db(), num(params[0]), await readJson(ctx.request, CategoryInput.partial()), origin))],
  ['DELETE', /^categories\/(\d+)$/, async ({ params }) => {
    await deleteDict(db(), 'category', num(params[0]));
    return json({ ok: true });
  }],

  // ---- Подписчики и статистика ----
  ['GET', /^subscribers$/, async () => json(await subscribersSummary(db()))],
  ['GET', /^stats$/, async ({ url }) => json(await getStats(db(), url.searchParams.get('period') ?? '30'))],
];

const handler: APIRoute = async (ctx) => {
  try {
    const path = (ctx.params.path ?? '').replace(/^\/+|\/+$/g, '');
    const url = new URL(ctx.request.url);

    // Скачивание CSV по одноразовой подписанной ссылке (Telegram downloadFile не передаёт заголовки).
    if (ctx.request.method === 'GET' && path === 'leads/export') {
      const payload = await verifyToken(exportSecret(), url.searchParams.get('token') ?? '');
      if (!payload) throw new HttpError(403, 'Ссылка устарела — сформируйте выгрузку заново');
      const [fromS, toS, ...rest] = payload.split('-');
      const csv = await leadsCsv(db(), Number(fromS), Number(toS));
      const filename = rest.join('-').replace(/[^\w.-]/g, '') || 'leads.csv';
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
          'cache-control': 'no-store',
        },
      });
    }

    const admin = await requireAdmin(env, ctx.request);
    for (const [method, re, h] of routes) {
      if (method !== ctx.request.method) continue;
      const m = re.exec(path);
      if (m) return await h({ ctx, admin, params: m.slice(1), url, origin: url.origin });
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
