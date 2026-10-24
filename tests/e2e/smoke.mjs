// Сквозная проверка на запущенном Worker (локально: `npm run preview`, затем `npm run test:e2e`).
// BASE=https://bmarket-staging.<...>.workers.dev BOT_TOKEN=... ADMIN_ID=... npm run test:e2e — для staging.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const devVars = existsSync('.dev.vars')
  ? Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {};
const TOKEN = process.env.BOT_TOKEN ?? devVars.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? devVars.TELEGRAM_WEBHOOK_SECRET;
const ADMIN_ID = Number(process.env.ADMIN_ID ?? (devVars.ADMIN_TELEGRAM_IDS ?? '').split(',')[0]);
const LOCAL = /127\.0\.0\.1|localhost/.test(BASE);

let passed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) passed++;
  else failures.push(`✗ ${name} ${extra}`);
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ' ' + extra}`);
}

function initData(user, extra = {}) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user), query_id: 'AAEtest', ...extra };
  const dcs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}
const ADMIN = initData({ id: ADMIN_ID, first_name: 'Админ', username: 'admin_one' });
const VISITOR = initData({ id: 999001, first_name: 'Гость', username: 'guest' });

async function req(path, { method = 'GET', body, auth, form, headers = {} } = {}) {
  const h = { ...headers };
  if (auth) h.authorization = `tma ${auth}`;
  let b;
  if (form) b = form;
  else if (body !== undefined) {
    h['content-type'] = 'application/json';
    b = JSON.stringify(body);
  }
  const r = await fetch(BASE + path, { method, headers: h, body: b, redirect: 'manual' });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
}

const SECRET_RE = /SECRET-|secret_owner|\+97250000000\d/;

if (LOCAL) {
  // Чистое состояние: тестовые лоты заново, без заявок и событий.
  execSync('npx wrangler d1 execute catalog-prod --local --file seed/test-lots.sql', { stdio: 'ignore' });
  execSync(`npx wrangler d1 execute catalog-prod --local --command "DELETE FROM leads; DELETE FROM events; DELETE FROM subscribers; DELETE FROM broadcasts; DELETE FROM edit_requests; DELETE FROM payments; DELETE FROM visitor_profiles; DELETE FROM settings WHERE key LIKE 'seller_%' OR key LIKE 'managers_%' OR key LIKE 'survey_%'; UPDATE businesses SET status='deleted' WHERE lot_number > 1005;"`, { stdio: 'ignore' });
}

// ---------- Публичный каталог ----------
const home = await req('/');
check('главная 200', home.status === 200);
check('заголовок главной по шаблону', /<title>Готовый бизнес на продажу в Израиле \| /.test(home.text));
check('html lang=ru', home.text.includes('<html lang="ru"'));
check('канонический адрес', /<link rel="canonical" href="[^"]+\/"/.test(home.text));
check('schema.org Organization', home.text.includes('"@type":"Organization"'));
check('лента городов: только с лотами', home.text.includes('Хайфа · 1') && !home.text.includes('Ашдод ·') && !home.text.includes('Нетания ·'));
check('закреплённый лот первым', home.text.indexOf('Кофейня с террасой') < home.text.indexOf('Барбершоп'));
check('метка «Новое» у свежего лота', home.text.includes('>Новое<'));
check('цена в USD в списке', /≈ \$\d/.test(home.text));
check('черновик и снятый не в списке', !home.text.includes('Салон красоты в Нетании') && !home.text.includes('Минимаркет'));

const city = await req('/city/haifa');
check('город 200 + заголовок', city.status === 200 && city.text.includes('Бизнес на продажу в Хайфе — 1 предложение'));
check('город: h1', city.text.includes('Бизнесы на продажу в Хайфе'));
check('город без лотов: noindex', (await req('/city/eilat')).text.includes('noindex'));
check('неизвестный город 404', (await req('/city/atlantis')).status === 404);

const short = await req('/business/1001');
check('короткий адрес → 301 на канонический', short.status === 301 && /\/business\/1001-kofeynya/.test(short.headers.get('location') ?? ''));
check('старый slug → 301', (await req('/business/1001-staryy-adres')).status === 301);
const card = await req('/business/1001-kofeynya-s-terrasoy-v-tsentre-hayfy');
check('карточка 200', card.status === 200);
check('карточка: title с ценой', /<title>Кофейня с террасой в центре Хайфы — ₪ 450 000 \| /.test(card.text));
check('карточка: Product+Offer ILS', card.text.includes('"@type":"Product"') && card.text.includes('"priceCurrency":"ILS"'));
check('карточка: BreadcrumbList', card.text.includes('"@type":"BreadcrumbList"'));
check('карточка: Open Graph фото', /<meta property="og:image" content="http[^"]+1600\.webp"/.test(card.text));
check('карточка: USD и EUR', /≈ \$[\d ]+ · ≈ €/.test(card.text));
check('карточка: курс Банка Израиля', card.text.includes('Пересчёт по курсу Банка Израиля на'));
check('карточка: торг', card.text.includes('Торг возможен'));
check('карточка: плитки показателей', ['Оборот в месяц', 'Чистая прибыль в месяц', 'Окупаемость', 'Аренда в месяц'].every((s) => card.text.includes(s)));
check('карточка: что входит', card.text.includes('Что входит в продажу') && card.text.includes('Клиентская база'));
check('карточка: Markdown', card.text.includes('<strong>с 2017 года</strong>') && card.text.includes('<h4>Что есть</h4>'));
check('карточка: пояснение о конфиденциальности', card.text.includes('Название и точный адрес сообщаются после заявки'));
check('карточка: srcset и alt', card.text.includes('600w') && card.text.includes('alt="Зал кофейни"'));
const card2 = await req('/business/1002-barbershop-na-4-kresla-v-tel-avive');
check('видео YouTube (ленивое)', card2.text.includes('data-yt="dQw4w9WgXcQ"'));

const gone = await req('/business/1004-minimarket-v-ashdode');
check('снятый лот → 410', gone.status === 410 && gone.text.includes('Этот бизнес снят с продажи'));
check('410: ссылки на другие лоты', gone.text.includes('/business/100'));
check('черновик → 404', (await req('/business/1005-salon-krasoty-v-netanii')).status === 404);
check('форма заявки 200 + noindex', (await req('/business/1001-kofeynya-s-terrasoy-v-tsentre-hayfy/request')).text.includes('noindex'));

const sitemap = await req('/sitemap.xml');
check('sitemap: опубликованные лоты', ['1001-', '1002-', '1003-'].every((l) => sitemap.text.includes(`/business/${l}`)));
check('sitemap: без снятых и черновиков', !sitemap.text.includes('/business/1004') && !sitemap.text.includes('/business/1005'));
check('sitemap: города с лотами', sitemap.text.includes('/city/haifa') && !sitemap.text.includes('/city/eilat'));
const robots = await req('/robots.txt');
check('robots: закрыты /admin и /api', robots.text.includes('Disallow: /admin') && robots.text.includes('Disallow: /api') && robots.text.includes('Sitemap:'));

for (const [name, r] of [['главная', home], ['город', city], ['карточка', card], ['карточка 2', card2], ['410', gone], ['sitemap', sitemap]]) {
  check(`нет скрытых данных: ${name}`, !SECRET_RE.test(r.text), (r.text.match(SECRET_RE) ?? [])[0]);
}

// ---------- Админ-API: защита ----------
check('админ-API без подписи → 401', (await req('/api/admin/me')).status === 401);
check('админ-API: посетитель → 403', (await req('/api/admin/businesses', { auth: VISITOR })).status === 403);
const forged = ADMIN.replace(String(ADMIN_ID), '999001');
check('админ-API: подделка → 401', (await req('/api/admin/me', { auth: forged })).status === 401);
const expired = initData({ id: ADMIN_ID }, { auth_date: String(Math.floor(Date.now() / 1000) - 90000) });
check('админ-API: initData старше 24 ч → 401', (await req('/api/admin/me', { auth: expired })).status === 401);
const me = await req('/api/admin/me', { auth: ADMIN });
check('админ-API: администратор → 200', me.status === 200 && me.json?.admin?.id === ADMIN_ID);
check('/api/me: признак админа', (await req('/api/me', { auth: ADMIN })).json?.isAdmin === true && (await req('/api/me', { auth: VISITOR })).json?.isAdmin === false);

// ---------- Админка: создать → фото → опубликовать ----------
const haifa = me.json.cities.find((c) => c.slug === 'haifa');
const cafe = me.json.categories.find((c) => c.slug === 'cafe-restaurants');
const created = await req('/api/admin/businesses', { method: 'POST', auth: ADMIN, body: { publicTitle: 'Пекарня у моря в Хайфе' } });
check('создан черновик', created.status === 201 && created.json?.business?.status === 'draft');
const bid = created.json.business.id;
const lot = created.json.business.lotNumber;
const notReady = await req(`/api/admin/businesses/${bid}/publish`, { method: 'POST', auth: ADMIN, body: { notify: true } });
check('публикация без обязательных полей → 422', notReady.status === 422 && notReady.json?.missing?.includes('минимум 1 фото'));

const upd = await req(`/api/admin/businesses/${bid}`, {
  method: 'PUT', auth: ADMIN,
  body: {
    cityId: haifa.id, categoryId: cafe.id, priceIls: 300000, monthlyProfitIls: 20000, shortDescription: 'Пекарня с постоянными клиентами',
    description: 'Описание **пекарни**', realName: 'SECRET-REAL-NAME-NEW', ownerPhone: '+972500000009', expectedUpdatedAt: created.json.business.updatedAt,
  },
});
check('сохранение формы', upd.status === 200 && upd.json?.business?.paybackMonths === 15);
const stale = await req(`/api/admin/businesses/${bid}`, { method: 'PUT', auth: ADMIN, body: { areaNote: 'x', expectedUpdatedAt: created.json.business.updatedAt } });
check('одновременная правка → 409', stale.status === 409);

const photo = readFileSync('seed/photos/1001-0-1600.webp');
const small = readFileSync('seed/photos/1001-0-600.webp');
const form = new FormData();
form.set('large', new Blob([photo], { type: 'image/webp' }), 'l.webp');
form.set('small', new Blob([small], { type: 'image/webp' }), 's.webp');
form.set('width', '1600');
form.set('height', '1200');
const up = await req(`/api/admin/businesses/${bid}/photos`, { method: 'POST', auth: ADMIN, form });
check('загрузка фото в R2', up.status === 201 && /lots\/\d+\/.+-1600\.webp/.test(up.json?.r2Key ?? ''));
const badForm = new FormData();
badForm.set('large', new Blob(['<svg/>'], { type: 'image/webp' }), 'x.webp');
badForm.set('small', new Blob(['<svg/>'], { type: 'image/webp' }), 'x.webp');
badForm.set('width', '10');
badForm.set('height', '10');
check('не-изображение отклоняется', (await req(`/api/admin/businesses/${bid}/photos`, { method: 'POST', auth: ADMIN, form: badForm })).status === 415);
check('фото: посетителю запрещено', (await req(`/api/admin/businesses/${bid}/photos`, { method: 'POST', auth: VISITOR, form })).status === 403);

const pub = await req(`/api/admin/businesses/${bid}/publish`, { method: 'POST', auth: ADMIN, body: { notify: true } });
check('публикация + рассылка в очереди', pub.status === 200 && pub.json?.business?.status === 'published' && pub.json?.notificationQueued === true);
const path = pub.json.path;
const newCard = await req(path);
check('новый лот сразу в каталоге', newCard.status === 200 && (await req('/')).text.includes('Пекарня у моря в Хайфе'));
check('нет скрытых данных нового лота', !SECRET_RE.test(newCard.text));
const preview = await req(pub.json.previewUrl);
check('предпросмотр по подписи', preview.status === 200 && preview.text.includes('Предпросмотр'));
await req(`/api/admin/businesses/${bid}/hide`, { method: 'POST', auth: ADMIN });
const repub = await req(`/api/admin/businesses/${bid}/publish`, { method: 'POST', auth: ADMIN, body: { notify: true } });
check('повторная публикация не вызывает рассылку', repub.json?.notificationQueued === false);
const subs = await req('/api/admin/subscribers', { auth: ADMIN });
check('рассылка в истории', subs.json?.broadcasts?.some((b) => b.lots.includes(lot)));
const dup = await req(`/api/admin/businesses/${bid}/duplicate`, { method: 'POST', auth: ADMIN });
check('дублирование с фото', dup.status === 201 && dup.json?.photos?.length === 1 && dup.json?.business?.status === 'draft');
check('удаление черновика', (await req(`/api/admin/businesses/${dup.json.business.id}`, { method: 'DELETE', auth: ADMIN })).status === 200);
check('опубликованный не удаляется', (await req(`/api/admin/businesses/${bid}`, { method: 'DELETE', auth: ADMIN })).status === 400);
const list = await req('/api/admin/businesses?status=published', { auth: ADMIN });
check('список объявлений с фильтром', list.status === 200 && list.json.items.every((i) => i.status === 'published'));

// ---------- Заявки ----------
const b1001 = list.json.items.find((i) => i.lotNumber === 1001);
const leadTg = await req('/api/leads', { method: 'POST', body: { businessId: b1001.id, name: 'Гость из Telegram', phone: '054-123-4567', preferredContact: 'telegram', consent: true, initData: VISITOR } });
check('заявка из мини-приложения', leadTg.status === 201);
const leadBad = await req('/api/leads', { method: 'POST', body: { businessId: b1001.id, name: 'Д', phone: '123', preferredContact: 'phone', consent: true } });
check('валидация заявки', leadBad.status === 400);
check('без согласия — отказ', (await req('/api/leads', { method: 'POST', body: { businessId: b1001.id, name: 'Дмитрий', phone: '0541234567', preferredContact: 'phone', consent: false } })).status === 400);
const honeypot = await req('/api/leads', { method: 'POST', body: { businessId: b1001.id, name: 'Бот', phone: '0541234567', preferredContact: 'phone', consent: true, website: 'spam' } });
check('ловушка: тихо отброшено', honeypot.status === 200 && !honeypot.json?.id);
const hiddenLot = (await req('/api/admin/businesses?status=hidden', { auth: ADMIN })).json.items.find((i) => i.lotNumber === 1004);
check('заявка на снятый лот — 404', (await req('/api/leads', { method: 'POST', body: { businessId: hiddenLot.id, name: 'Дмитрий', phone: '0541234567', preferredContact: 'phone', consent: true } })).status === 404);
let limited = false;
let webLead;
for (let i = 0; i < 6; i++) {
  const r = await req('/api/leads', { method: 'POST', body: { businessId: b1001.id, name: 'Дмитрий', phone: '+972 54 123 4567', preferredContact: 'whatsapp', comment: 'Интересует оборот', consent: true, utm: { utm_source: 'google', utm_campaign: 'test' }, visitorId: 'e2e-visitor-0001' } });
  if (i === 0) webLead = r;
  if (r.status === 429) limited = true;
}
check('заявка с сайта', webLead.status === 201);
check('не более 5 заявок в час', limited);

const leads = await req('/api/admin/leads', { auth: ADMIN });
check('заявки в админке', leads.status === 200 && leads.json.items.length >= 2);
check('недоставленные в Telegram — вверху', leads.json.items[0].tgDelivered === false || leads.json.items[0].tgDelivered === null);
const ld = await req(`/api/admin/leads/${webLead.json.id}`, { auth: ADMIN });
check('карточка заявки: скрытые данные лота для админа', ld.json?.business?.realName?.startsWith('SECRET-REAL-NAME-1001'));
check('карточка заявки: UTM', ld.json?.lead?.utmSource === 'google');
check('заявку не видит посетитель', (await req(`/api/admin/leads/${webLead.json.id}`, { auth: VISITOR })).status === 403);
const st = await req(`/api/admin/leads/${webLead.json.id}`, { method: 'PATCH', auth: ADMIN, body: { status: 'in_progress', adminNote: 'Позвонить вечером' } });
check('смена статуса и заметка', st.json?.lead?.status === 'in_progress' && st.json?.lead?.handledBy === ADMIN_ID);
const link = await req('/api/admin/leads/export-link?from=2020-01-01&to=2030-01-01', { method: 'POST', auth: ADMIN });
const csv = await req(link.json.url);
check('выгрузка CSV', csv.status === 200 && csv.text.includes('№;Дата;Лот') && csv.text.includes('Интересует оборот') && /attachment; filename="leads_2020-01-01_2030-01-01\.csv"/.test(csv.headers.get('content-disposition') ?? ''), csv.headers.get('content-disposition'));
check('CSV без подписи — 403', (await req('/api/admin/leads/export?token=bad')).status === 403);

// ---------- События и статистика ----------
const ev1 = await req('/api/events', { method: 'POST', body: { type: 'listing_view', businessId: b1001.id, visitorId: 'e2e-visitor-0001' } });
const ev2 = await req('/api/events', { method: 'POST', body: { type: 'listing_view', businessId: b1001.id, visitorId: 'e2e-visitor-0001' } });
check('просмотр: не чаще 1 раза в 30 минут', ev1.json?.recorded === true && ev2.json?.recorded === false);
const evAdmin = await req('/api/events', { method: 'POST', body: { type: 'listing_view', businessId: b1001.id, initData: ADMIN } });
check('просмотры админов не учитываются', evAdmin.json?.skipped === 'admin');
await req('/api/events', { method: 'POST', body: { type: 'app_open', initData: VISITOR } });
const stats = await req('/api/admin/stats?period=30', { auth: ADMIN });
check('статистика', stats.status === 200 && stats.json.views >= 1 && stats.json.leads >= 2 && stats.json.opens.miniApp >= 1 && stats.json.daily.length >= 30);
check('статистика: топ и города', stats.json.topByViews[0]?.lot === 1001 && stats.json.cities.some((c) => c.city === 'Хайфа'));

// ---------- Подписка ----------
check('подписка: только из Telegram', (await req('/api/subscription')).status === 401);
check('подписка: статус', (await req('/api/subscription', { auth: VISITOR })).json?.subscribed === false);
check('подписаться', (await req('/api/subscription', { method: 'POST', auth: VISITOR })).json?.subscribed === true);
check('статус после подписки', (await req('/api/subscription', { auth: VISITOR })).json?.subscribed === true);
check('отписаться', (await req('/api/subscription', { method: 'DELETE', auth: VISITOR })).json?.subscribed === false);

// ---------- Справочники ----------
const nc = await req('/api/admin/cities', { method: 'POST', auth: ADMIN, body: { name: 'Тестоград', namePrepositional: 'Тестограде' } });
check('добавить город', nc.status === 201 && nc.json.slug === 'testograd');
check('удалить город без лотов', (await req(`/api/admin/cities/${nc.json.id}`, { method: 'DELETE', auth: ADMIN })).status === 200);
check('город с лотами не удаляется', (await req(`/api/admin/cities/${haifa.id}`, { method: 'DELETE', auth: ADMIN })).status === 409);

// ---------- Вебхук бота ----------
const upd1 = { update_id: 1, message: { message_id: 1, date: 1, chat: { id: 999001, type: 'private' }, from: { id: 999001, is_bot: false, first_name: 'Гость' }, text: '/start', entities: [{ type: 'bot_command', offset: 0, length: 6 }] } };
check('вебхук без секрета → 403', (await req('/api/telegram/webhook', { method: 'POST', body: upd1 })).status === 403);
const wh = await req('/api/telegram/webhook', { method: 'POST', body: upd1, headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET } });
check('вебхук с секретом → 200', wh.status === 200, `got ${wh.status}`);


// ---------- Группа менеджеров: диагностика ----------
const gs = await req('/api/admin/telegram/status', { auth: ADMIN });
check('статус группы: только админ', (await req('/api/admin/telegram/status', { auth: VISITOR })).status === 403);
check('статус группы: есть недоставленные', gs.status === 200 && gs.json.undelivered >= 1, JSON.stringify(gs.json));
const gt = await req('/api/admin/telegram/test', { method: 'POST', auth: ADMIN });
check('проверка группы: понятная ошибка', gt.status === 502 && /ID группы|группа|бот/i.test(gt.json?.error ?? ''), gt.text);
check('ошибка запомнена для админки', (await req('/api/admin/telegram/status', { auth: ADMIN })).json?.lastError?.error?.length > 5);

// ---------- Продавец: черновик → оплата PayPal → публикация ----------
// Поддельный PayPal на 127.0.0.1:8799 (PAYPAL_API_BASE в .dev.vars).
const orders = new Map();
let orderSeq = 0;
const paypal = createServer(async (rq, rs) => {
  let body = '';
  for await (const ch of rq) body += ch;
  const send = (code, data) => { rs.writeHead(code, { 'content-type': 'application/json' }); rs.end(JSON.stringify(data)); };
  const u = rq.url ?? '';
  if (u === '/v1/oauth2/token') return send(200, { access_token: 'TEST', expires_in: 3600 });
  if (u === '/v1/notifications/verify-webhook-signature') {
    const b = JSON.parse(body);
    return send(200, { verification_status: b.transmission_sig === 'good' && b.webhook_id === 'WH-TEST' && b.webhook_event?.event_type ? 'SUCCESS' : 'FAILURE' });
  }
  if (u === '/v2/checkout/orders' && rq.method === 'POST') {
    const b = JSON.parse(body);
    const id = `ORDTEST${++orderSeq}`;
    orders.set(id, { id, status: 'CREATED', purchase_units: [{ custom_id: b.purchase_units[0].custom_id, amount: b.purchase_units[0].amount }], returnUrl: b.payment_source.paypal.experience_context.return_url });
    return send(201, { id, status: 'CREATED', links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }] });
  }
  const m = /^\/v2\/checkout\/orders\/([A-Z0-9]+)(\/capture)?$/.exec(u);
  const o = m && orders.get(m[1]);
  if (!o) return send(404, { name: 'RESOURCE_NOT_FOUND' });
  if (m[2]) {
    if (o.status !== 'APPROVED') return send(422, { name: 'UNPROCESSABLE_ENTITY', message: o.status === 'COMPLETED' ? 'ORDER_ALREADY_CAPTURED' : 'ORDER_NOT_APPROVED' });
    o.status = 'COMPLETED';
    o.purchase_units[0].payments = { captures: [{ id: 'CAP' + o.id, status: 'COMPLETED', amount: o.purchase_units[0].amount }] };
  }
  const { returnUrl: _r, ...pub } = o;
  return send(200, pub);
}).listen(8799, '127.0.0.1');

const SELLER = initData({ id: 777001, first_name: 'Продавец', username: 'seller_one' });
const OTHER = initData({ id: 777002, first_name: 'Чужой' });
check('продавец: без Telegram → 401', (await req('/api/seller/me')).status === 401);
const sme = await req('/api/seller/me', { auth: SELLER });
check('продавец: кабинет', sme.status === 200 && Array.isArray(sme.json.items) && sme.json.priceIls === 199 && sme.json.payment.paypal === true, sme.text.slice(0, 200));
const sd = await req('/api/seller/businesses', { method: 'POST', auth: SELLER });
const sid = sd.json?.business?.id;
check('продавец: черновик создан', sd.status === 201 && sd.json.business.sellerStage === 'editing' && sd.json.business.ownerTelegram === '@seller_one');
check('черновик продавца не виден в общем списке админки', !(await req('/api/admin/businesses', { auth: ADMIN })).json.items.some((x) => x.id === sid));
check('черновик продавца — во вкладке «От продавцов»', (await req('/api/admin/businesses?status=seller', { auth: ADMIN })).json.items.some((x) => x.id === sid && x.sellerStage === 'editing'));
const sput = await req(`/api/seller/businesses/${sid}`, {
  method: 'PUT', auth: SELLER,
  body: {
    publicTitle: 'Пекарня у моря в Хайфе', cityId: haifa.id, categoryId: sme.json.categories[0].id, priceIls: 300000,
    shortDescription: 'Пекарня с постоянными клиентами', description: 'Работает 6 лет, своя рецептура.', ownerPhone: '+972500000009',
    realName: 'SECRET-Пекарня Шломо', exactAddress: 'SECRET-адрес', isFeatured: true, internalNotes: 'взлом',
    expectedUpdatedAt: sd.json.business.updatedAt,
  },
});
check('продавец: автосохранение', sput.status === 200 && sput.json.business.publicTitle === 'Пекарня у моря в Хайфе', sput.text.slice(0, 200));
check('продавец: служебные поля игнорируются', sput.json?.business?.isFeatured === undefined && sput.json?.business?.internalNotes === undefined);
check('продавец: не хватает фото', sput.json?.missing?.includes('минимум 1 фото'));
check('чужой продавец не видит черновик', (await req(`/api/seller/businesses/${sid}`, { auth: OTHER })).status === 404);
check('чужой продавец не меняет черновик', (await req(`/api/seller/businesses/${sid}`, { method: 'PUT', auth: OTHER, body: { publicTitle: 'x' } })).status === 404);
check('отправка без фото → 422', (await req(`/api/seller/businesses/${sid}/submit`, { method: 'POST', auth: SELLER })).status === 422);
const sform = new FormData();
sform.set('large', new Blob([photo], { type: 'image/webp' }), 'l.webp');
sform.set('small', new Blob([small], { type: 'image/webp' }), 's.webp');
sform.set('width', '1600');
sform.set('height', '1200');
check('продавец: фото загружено', (await req(`/api/seller/businesses/${sid}/photos`, { method: 'POST', auth: SELLER, form: sform })).status === 201);
check('чужой не загружает фото', (await req(`/api/seller/businesses/${sid}/photos`, { method: 'POST', auth: OTHER, form: sform })).status === 404);
const ssub = await req(`/api/seller/businesses/${sid}/submit`, { method: 'POST', auth: SELLER });
check('отправлено → ждёт оплаты', ssub.status === 200 && ssub.json.business.sellerStage === 'awaiting_payment', ssub.text.slice(0, 200));
check('после отправки править нельзя', (await req(`/api/seller/businesses/${sid}`, { method: 'PUT', auth: SELLER, body: { publicTitle: 'Новое' } })).status === 409);
const spay = await req(`/api/seller/businesses/${sid}/pay`, { method: 'POST', auth: SELLER });
check('PayPal: ссылка на оплату', spay.status === 200 && spay.json.approveUrl.includes('checkoutnow?token=ORDTEST'), spay.text);
const order1 = spay.json?.orderId;
const notPaid = await req(`/pay/paypal/return?token=${order1}`);
check('возврат без оплаты: «не завершена»', notPaid.status === 200 && notPaid.text.includes('Оплата не завершена'));
orders.get(order1).status = 'APPROVED';
const back = await req(`/pay/paypal/return?token=${order1}&PayerID=TEST`);
check('возврат после оплаты: списано', back.text.includes('Оплата прошла'), back.text.slice(0, 300));
const spub = await req(`/api/seller/businesses/${sid}`, { auth: SELLER });
check('после оплаты — опубликовано автоматически', spub.json?.business?.status === 'published' && spub.json.business.sellerStage === 'approved' && spub.json.paid === true, JSON.stringify(spub.json?.business?.status));
check('повторный возврат безопасен', (await req(`/pay/paypal/return?token=${order1}`)).text.includes('Оплата прошла'));
const sellerCard = await req(spub.json.path);
check("карточка продавца публичная", sellerCard.status === 200 && sellerCard.text.includes('Пекарня у моря в Хайфе'));
check("скрытые данные продавца не в карточке", !SECRET_RE.test(sellerCard.text) && !sellerCard.text.includes('seller_one'));
check('опубликованное продавец не правит', (await req(`/api/seller/businesses/${sid}`, { method: 'PUT', auth: SELLER, body: { priceIls: 1 } })).status === 409);
check('опубликованное продавец не удаляет', (await req(`/api/seller/businesses/${sid}`, { method: 'DELETE', auth: SELLER })).status === 409);
const ereq = await req(`/api/seller/businesses/${sid}/edit-requests`, { method: 'POST', auth: SELLER, body: { text: 'Снизить цену до 280 000' } });
check('запрос на изменение отправлен', ereq.status === 201 && ereq.json.editRequests[0]?.status === 'new');
const sov = await req('/api/admin/seller', { auth: ADMIN });
check('админ видит запрос', sov.status === 200 && sov.json.requests.some((r) => r.businessId === sid) && sov.json.queue.openEditRequests >= 1);
const adet = await req(`/api/admin/businesses/${sid}`, { auth: ADMIN });
check('админ: блок продавца', adet.json?.seller?.paid === true && adet.json.seller.payments[0].provider === 'paypal' && adet.json.seller.tgId === 777001);
const rid = adet.json.seller.editRequests[0].id;
const done = await req(`/api/admin/edit-requests/${rid}`, { method: 'PATCH', auth: ADMIN, body: { status: 'done', adminNote: 'Цена изменена' } });
check('админ: запрос выполнен', done.status === 200 && done.json.seller.editRequests[0].status === 'done');

// Режим проверки администратором + вебхук PayPal.
check('настройка: публикация после проверки', (await req('/api/admin/seller/settings', { method: 'PUT', auth: ADMIN, body: { autoPublish: false } })).json?.settings?.autoPublish === false);
check('настройки — только админ', (await req('/api/admin/seller/settings', { method: 'PUT', auth: SELLER, body: { priceIls: 0 } })).status === 403);
const sd2 = await req('/api/seller/businesses', { method: 'POST', auth: SELLER });
const sid2 = sd2.json.business.id;
await req(`/api/seller/businesses/${sid2}`, { method: 'PUT', auth: SELLER, body: { publicTitle: 'Цветочный магазин в Хайфе', cityId: haifa.id, categoryId: sme.json.categories[0].id, priceIls: 150000, shortDescription: 'Цветы', description: 'Описание', ownerPhone: '+972500000008' } });
await req(`/api/seller/businesses/${sid2}/photos`, { method: 'POST', auth: SELLER, form: sform });
await req(`/api/seller/businesses/${sid2}/submit`, { method: 'POST', auth: SELLER });
const order2 = (await req(`/api/seller/businesses/${sid2}/pay`, { method: 'POST', auth: SELLER })).json?.orderId;
orders.get(order2).status = 'APPROVED';
const whEvent = { id: 'WH-1', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: order2, status: 'APPROVED' } };
const whHeaders = (sig) => ({ 'paypal-auth-algo': 'SHA256withRSA', 'paypal-cert-url': 'https://api.sandbox.paypal.com/cert', 'paypal-transmission-id': 't1', 'paypal-transmission-sig': sig, 'paypal-transmission-time': new Date().toISOString() });
check('вебхук PayPal: неверная подпись → 400', (await req('/api/paypal/webhook', { method: 'POST', body: whEvent, headers: whHeaders('bad') })).status === 400);
check('после поддельного вебхука не оплачено', (await req(`/api/seller/businesses/${sid2}`, { auth: SELLER })).json?.paid === false);
check('вебхук PayPal: подпись верна → 200', (await req('/api/paypal/webhook', { method: 'POST', body: whEvent, headers: whHeaders('good') })).status === 200);
const s2 = await req(`/api/seller/businesses/${sid2}`, { auth: SELLER });
check('после вебхука — на проверке', s2.json?.paid === true && s2.json.business.status === 'draft' && s2.json.business.sellerStage === 'in_review', JSON.stringify(s2.json?.business?.sellerStage));
check('на проверке — виден в общем списке админки', (await req('/api/admin/businesses', { auth: ADMIN })).json.items.some((x) => x.id === sid2 && x.sellerStage === 'in_review'));
const pub2 = await req(`/api/admin/businesses/${sid2}/publish`, { method: 'POST', auth: ADMIN, body: { notify: false } });
check('админ опубликовал → этап approved', pub2.status === 200 && pub2.json.business.status === 'published' && pub2.json.business.sellerStage === 'approved');

// Оплата вручную (без PayPal) и возврат на доработку.
const sd3 = await req('/api/seller/businesses', { method: 'POST', auth: SELLER });
const sid3 = sd3.json.business.id;
await req(`/api/seller/businesses/${sid3}`, { method: 'PUT', auth: SELLER, body: { publicTitle: 'Автомойка в Хайфе', cityId: haifa.id, categoryId: sme.json.categories[0].id, priceIls: 500000, shortDescription: 'Мойка', description: 'Описание', ownerPhone: '+972500000007' } });
await req(`/api/seller/businesses/${sid3}/photos`, { method: 'POST', auth: SELLER, form: sform });
await req(`/api/seller/businesses/${sid3}/submit`, { method: 'POST', auth: SELLER });
const mp = await req(`/api/admin/businesses/${sid3}/mark-paid`, { method: 'POST', auth: ADMIN, body: { note: 'перевод' } });
check('оплата вручную → на проверке', mp.status === 200 && mp.json.seller.paid && mp.json.business.sellerStage === 'in_review');
const rts = await req(`/api/admin/businesses/${sid3}/return-to-seller`, { method: 'POST', auth: ADMIN, body: { comment: 'Уберите вывеску с фото' } });
check('возврат на доработку', rts.status === 200 && rts.json.business.sellerStage === 'editing');
check('после возврата продавец снова правит', (await req(`/api/seller/businesses/${sid3}`, { method: 'PUT', auth: SELLER, body: { shortDescription: 'Мойка без вывески' } })).status === 200);
const rs3 = await req(`/api/seller/businesses/${sid3}/submit`, { method: 'POST', auth: SELLER });
check('повторная отправка без повторной оплаты', rs3.status === 200 && rs3.json.business.sellerStage === 'in_review');
check('лимит открытых черновиков', await (async () => {
  for (let i = 0; i < 3; i++) await req('/api/seller/businesses', { method: 'POST', auth: OTHER });
  return (await req('/api/seller/businesses', { method: 'POST', auth: OTHER })).status === 429;
})());
check('страница /sell', (await req('/sell')).status === 200);
await req('/api/admin/seller/settings', { method: 'PUT', auth: ADMIN, body: { autoPublish: true } });
for (const x of [sid, sid2]) await req(`/api/admin/businesses/${x}/hide`, { method: 'POST', auth: ADMIN });
paypal.close();

// ---------- Опрос при первом запуске ----------
check('опрос: только из Telegram', (await req('/api/profile')).status === 401);
const pr0 = await req('/api/profile', { auth: VISITOR });
check('опрос выключен по умолчанию, ответов нет', pr0.status === 200 && pr0.json.surveyEnabled === false && pr0.json.profile === null, pr0.text);
check('включить опрос — только админ', (await req('/api/admin/survey', { method: 'PUT', auth: VISITOR, body: { enabled: true } })).status === 403);
check('админ включил опрос', (await req('/api/admin/survey', { method: 'PUT', auth: ADMIN, body: { enabled: true } })).json?.enabled === true);
check('опрос включён для пользователя', (await req('/api/profile', { auth: VISITOR })).json?.surveyEnabled === true);
const fac = await req('/api/survey/facets');
check('данные опроса: справочники и лоты', fac.status === 200 && fac.json.categories.length > 5 && fac.json.cities.length === 1 && fac.json.cities[0].name === 'Хайфа' && fac.json.lots.length >= 2);
check('данные опроса без скрытых полей', !SECRET_RE.test(fac.text) && !/real_?name|exact_?address|owner|internal/i.test(fac.text));
check('данные опроса: только опубликованные', !fac.text.includes('Салон красоты в Нетании') && !fac.text.includes('Минимаркет'));
const cafeLot = fac.json.lots.find((l) => l.title.includes('Кофейня'));
check('опрос: неверный бюджет → 400', (await req('/api/profile', { method: 'PUT', auth: VISITOR, body: { intent: 'buy', budget: 'b9', status: 'completed' } })).status === 400);
const pr1 = await req('/api/profile', { method: 'PUT', auth: VISITOR, body: { intent: 'buy', categories: [cafeLot.categoryId], cities: [haifa.id], budget: 'b500', timeline: 'asap', wishes: ['payback24', 'staff'], comment: 'Ищу с террасой', status: 'completed' } });
check('опрос покупателя сохранён', pr1.status === 200 && pr1.json.profile.completed === true && pr1.json.profile.budget === 'b500' && pr1.json.profile.timeline === null, pr1.text);
check('уведомления только о подходящих', (await req('/api/profile/notify', { method: 'POST', auth: VISITOR, body: { on: true } })).json?.notifyMatching === true);
check('ответы видны с другого устройства', (await req('/api/profile', { auth: VISITOR })).json?.profile?.notifyMatching === true);
const cons = await req('/api/profile/consult', { method: 'POST', auth: VISITOR, body: { phone: '972541234567' } });
check('запрос менеджеру', cons.status === 200 && cons.json.repeated === false, cons.text);
check('повторный запрос не дублируется', (await req('/api/profile/consult', { method: 'POST', auth: VISITOR, body: {} })).json?.repeated === true);
const SKIPPER = initData({ id: 777004, first_name: 'Пропустил' });
check('опрос пропущен', (await req('/api/profile', { method: 'PUT', auth: SKIPPER, body: { intent: null, status: 'skipped' } })).json?.profile?.skipped === true);
const sst = await req('/api/admin/survey', { auth: ADMIN });
check('статистика опроса', sst.status === 200 && sst.json.completed.buy >= 1 && sst.json.skipped >= 1 && sst.json.consults.some((c) => c.userId === 999001 && c.phone === '+972541234567'), sst.text.slice(0, 300));
const leadDet = await req(`/api/admin/leads/${leadTg.json.id}`, { auth: ADMIN });
check('в заявке — запрос из опроса', /Ищет: .*Хайфа · до ₪ 500 000/.test(leadDet.json?.buyerRequest ?? ''), leadDet.json?.buyerRequest);
const SELLER3 = initData({ id: 777003, first_name: 'Продавец3' });
const pre = await req('/api/seller/businesses', { method: 'POST', auth: SELLER3, body: { categoryId: cafeLot.categoryId, cityId: haifa.id } });
check('черновик продавца со сферой и городом из опроса', pre.status === 201 && pre.json.business.categoryId === cafeLot.categoryId && pre.json.business.cityId === haifa.id);
check('главная: незавершённый черновик продавца', (await req('/api/profile', { auth: SELLER3 })).json?.openListing?.stage === 'editing');
await req(`/api/seller/businesses/${pre.json.business.id}`, { method: 'DELETE', auth: SELLER3 });
check('после удаления черновика блока нет', (await req('/api/profile', { auth: SELLER3 })).json?.openListing === null);
const homeTg = await req('/');
check('главная: место для подборки и данные карточек', homeTg.text.includes('id="for-you"') && /data-category="\d+"/.test(homeTg.text) && /data-price="\d+"/.test(homeTg.text));
await req('/api/admin/survey', { method: 'PUT', auth: ADMIN, body: { enabled: false } });

// ---------- Бейджи проверок и платные услуги ----------
const homeB = await req('/?b=' + Date.now());
check('бейджи в ленте', homeB.text.includes('Оценка подтверждена') && homeB.text.includes('Пройден аудит'));
const cardB = await req('/business/1001');
const cardB2 = cardB.status === 301 ? await req(cardB.headers.get('location')) : cardB;
check('пояснение бейджей в карточке', cardB2.text.includes('Бизнес оценили эксперты Бизнес Маркета') && cardB2.text.includes('Проведён экспертный финансовый аудит'));
check('заказанные услуги не публикуются', !/extras_?ordered/i.test(cardB2.text));
const SELLER5 = initData({ id: 777005, first_name: 'Продавец5' });
const sx = await req('/api/seller/businesses', { method: 'POST', auth: SELLER5 });
const sxid = sx.json.business.id;
check('цены услуг по умолчанию', sx.json.valuationPriceIls === 1500 && sx.json.auditPriceIls === 4000 && sx.json.total === 199);
const sxu = await req(`/api/seller/businesses/${sxid}`, { method: 'PUT', auth: SELLER5, body: { publicTitle: 'Ресторан у моря в Хайфе', cityId: haifa.id, categoryId: sme.json.categories[0].id, priceIls: 900000, shortDescription: 'Ресторан', description: 'Описание', ownerPhone: '+972500000005', extrasOrdered: ['valuation', 'audit'], valuationVerifiedAt: Date.now() } });
check('продавец заказал оценку и аудит', sxu.status === 200 && sxu.json.total === 199 + 1500 + 4000 && sxu.json.business.extrasOrdered.length === 2, sxu.text.slice(0, 200));
check('продавец не ставит бейдж сам', sxu.json?.business?.valuationVerifiedAt === null);
await req(`/api/seller/businesses/${sxid}/photos`, { method: 'POST', auth: SELLER5, form: sform });
check('отправка с услугами', (await req(`/api/seller/businesses/${sxid}/submit`, { method: 'POST', auth: SELLER5 })).json?.business?.sellerStage === 'awaiting_payment');
const mpx = await req(`/api/admin/businesses/${sxid}/mark-paid`, { method: 'POST', auth: ADMIN, body: {} });
check('оплата учитывает услуги', mpx.json?.seller?.payments?.[0]?.amount === (199 + 1500 + 4000) * 100 && mpx.json.seller.payments[0].items.join() === 'placement,valuation,audit' && mpx.json.seller.extrasOrdered.length === 2, JSON.stringify(mpx.json?.seller?.payments?.[0]));
const badge = await req(`/api/admin/businesses/${sxid}`, { method: 'PUT', auth: ADMIN, body: { valuationVerifiedAt: Date.now() } });
check('админ ставит бейдж', badge.status === 200 && badge.json.business.valuationVerifiedAt > 0);
await req(`/api/admin/businesses/${sxid}/hide`, { method: 'POST', auth: ADMIN });

// ---------- Только Хайфа ----------
const homeH = await req('/?h=' + Date.now());
check('лента городов: «Скоро! +весь Израиль»', homeH.text.includes('Скоро!') && homeH.text.includes('+весь Израиль'));
check('выключенные города не в ленте', !/Тель-Авив-Яффо · \d/.test(homeH.text));
check('страница выключенного города — 404', (await req('/city/tel-aviv')).status === 404);
check('продавцу доступна только Хайфа', (await req('/api/seller/me', { auth: SELLER })).json?.cities?.map((c) => c.name).join() === 'Хайфа');
check('админ видит все города с признаком', (await req('/api/admin/dicts', { auth: ADMIN })).json?.cities?.some((c) => c.isActive === false));

// ---------- Группа менеджеров: /setgroup ----------
const setgroup = { update_id: 2, message: { message_id: 2, date: 1, chat: { id: -100555, type: 'supergroup', title: 'Менеджеры' }, from: { id: ADMIN_ID, is_bot: false, first_name: 'Админ' }, text: '/setgroup', entities: [{ type: 'bot_command', offset: 0, length: 9 }] } };
const strangerSet = { ...setgroup, update_id: 3, message: { ...setgroup.message, chat: { id: -100666, type: 'supergroup', title: 'Чужая' }, from: { id: 999001, is_bot: false, first_name: 'Гость' } } };
await req('/api/telegram/webhook', { method: 'POST', body: strangerSet, headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET } });
check('/setgroup от не-админа игнорируется', (await req('/api/admin/telegram/status', { auth: ADMIN })).json?.overridden === false);
await req('/api/telegram/webhook', { method: 'POST', body: setgroup, headers: { 'x-telegram-bot-api-secret-token': WEBHOOK_SECRET } });
const gs2 = (await req('/api/admin/telegram/status', { auth: ADMIN })).json;
check('/setgroup от админа меняет группу', gs2?.chatId === '-100555' && gs2.overridden === true, JSON.stringify(gs2));
if (LOCAL) execSync(`npx wrangler d1 execute catalog-prod --local --command "DELETE FROM settings WHERE key LIKE 'managers_%'"`, { stdio: 'ignore' });

await req(`/api/admin/businesses/${bid}/hide`, { method: 'POST', auth: ADMIN });

console.log(`\n${passed} проверок пройдено, ${failures.length} не пройдено`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
