// Сквозная проверка на запущенном Worker (локально: `npm run preview`, затем `npm run test:e2e`).
// BASE=https://bmarket-staging.<...>.workers.dev BOT_TOKEN=... ADMIN_ID=... npm run test:e2e — для staging.
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

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
  execSync(`npx wrangler d1 execute catalog-prod --local --command "DELETE FROM leads; DELETE FROM events; DELETE FROM subscribers; DELETE FROM broadcasts; UPDATE businesses SET status='deleted' WHERE lot_number > 1005;"`, { stdio: 'ignore' });
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

await req(`/api/admin/businesses/${bid}/hide`, { method: 'POST', auth: ADMIN });

console.log(`\n${passed} проверок пройдено, ${failures.length} не пройдено`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
