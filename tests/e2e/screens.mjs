// Скриншоты для ручной проверки вёрстки: node tests/e2e/screens.mjs [outDir]
// Внутри Telegram эмулируется: telegram-web-app.js подменяется заглушкой с подписанным initData.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

// Playwright берётся из проекта или глобальной установки (NODE_PATH=$(npm root -g)).
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const OUT = process.argv[2] ?? 'tests/e2e/screenshots';
mkdirSync(OUT, { recursive: true });
const vars = Object.fromEntries(readFileSync('.dev.vars', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

function initData(user) {
  const f = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(user) };
  const dcs = Object.entries(f).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const s = createHmac('sha256', 'WebAppData').update(vars.TELEGRAM_BOT_TOKEN).digest();
  const p = new URLSearchParams(f);
  p.set('hash', createHmac('sha256', s).update(dcs).digest('hex'));
  return p.toString();
}

function tgStub(data, dark) {
  const theme = dark
    ? { bg_color: '#17212b', secondary_bg_color: '#0e1621', text_color: '#f5f5f5', hint_color: '#708499', link_color: '#6ab3f3', button_color: '#5288c1', button_text_color: '#ffffff', section_bg_color: '#17212b', destructive_text_color: '#ec3942' }
    : { bg_color: '#ffffff', secondary_bg_color: '#efeff3', text_color: '#000000', hint_color: '#707579', link_color: '#3390ec', button_color: '#3390ec', button_text_color: '#ffffff', section_bg_color: '#ffffff', destructive_text_color: '#e53935' };
  return `(() => {
    const theme = ${JSON.stringify(theme)};
    for (const [k, v] of Object.entries(theme)) document.documentElement.style.setProperty('--tg-theme-' + k.replace(/_/g, '-'), v);
    const btn = () => { const b = { text: '', isVisible: false, setText(t){ b.text=t; render(); return b; }, show(){ b.isVisible=true; render(); return b; }, hide(){ b.isVisible=false; render(); return b; }, enable(){return b;}, disable(){return b;}, showProgress(){return b;}, hideProgress(){return b;}, onClick(){return b;}, offClick(){return b;} };
      function render(){ let el=document.getElementById('tg-mainbutton'); if(!el){ el=document.createElement('div'); el.id='tg-mainbutton'; el.style.cssText='position:fixed;left:0;right:0;bottom:0;height:52px;display:flex;align-items:center;justify-content:center;font:600 16px system-ui;z-index:99;background:'+theme.button_color+';color:'+theme.button_text_color; document.body.appendChild(el);} el.textContent=b.text; el.style.display=b.isVisible?'flex':'none'; }
      return b; };
    window.Telegram = { WebApp: {
      initData: ${JSON.stringify(data)}, initDataUnsafe: { user: { id: 1, first_name: 'Моше' } }, version: '8.0', platform: 'ios', colorScheme: '${dark ? 'dark' : 'light'}', themeParams: theme,
      isVersionAtLeast: () => true, ready(){}, expand(){}, close(){}, setHeaderColor(){}, setBackgroundColor(){},
      BackButton: { isVisible: false, show(){}, hide(){}, onClick(){}, offClick(){} }, MainButton: btn(),
      HapticFeedback: { impactOccurred(){}, notificationOccurred(){} }, requestWriteAccess(cb){ cb && cb(true); }, requestContact(cb){ cb && cb(false); },
      openTelegramLink(){}, openLink(){}, showAlert(m, cb){ cb && cb(); }, showConfirm(m, cb){ cb && cb(true); }, onEvent(){},
    } };
  })();`;
}

const browser = await chromium.launch();
async function shot(name, path, { width = 390, height = 844, tg = null, dark = false, full = true, before, splash = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', locale: 'ru-RU' });
  // Заставку снимаем отдельно — на остальных экранах она уже «просмотрена».
  if (!splash) await ctx.addInitScript(() => { try { sessionStorage.setItem('bm_splash', '1'); } catch {} });
  const page = await ctx.newPage();
  await page.route('https://telegram.org/**', (r) => r.fulfill({ contentType: 'application/javascript', body: tgStub(tg, dark) }));
  await page.route('https://static.cloudflareinsights.com/**', (r) => r.abort());
  const url = BASE + path + (tg ? (path.includes('#') ? '&' : '#') + 'tgWebAppData=x&tgWebAppVersion=8.0' : '');
  await page.goto(url, { waitUntil: 'load' });
  if (before) await before(page);
  await page.waitForTimeout(900);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log(`${name}.png${overflow ? '  ⚠️ горизонтальная прокрутка!' : ''}`);
  await ctx.close();
  return overflow;
}

const CARD = '/business/1001-kofeynya-s-terrasoy-v-tsentre-hayfy';
const admin = initData({ id: Number(vars.ADMIN_TELEGRAM_IDS.split(',')[0]), first_name: 'Админ', username: 'admin_one' });
const guest = initData({ id: 999001, first_name: 'Гость' });
let bad = 0;
bad += await shot('01-home-320', '/', { width: 320, height: 640 });
bad += await shot('02-home-phone-dark', '/', { dark: true });
bad += await shot('03-home-desktop', '/', { width: 1280, height: 900 });
bad += await shot('03b-home-tablet', '/', { width: 700, height: 900 });
bad += await shot('04-card-320', CARD, { width: 320, height: 640 });
bad += await shot('05-card-desktop', CARD, { width: 1280, height: 900 });
bad += await shot('06-request-web', CARD + '/request', { width: 390 });
bad += await shot('07-gone-410', '/business/1004-minimarket-v-ashdode', { width: 390 });
bad += await shot('08-tg-home', '/', { tg: guest });
bad += await shot('09-tg-card-dark', CARD, { tg: guest, dark: true, full: false });
bad += await shot('10-tg-request', CARD + '/request', { tg: guest });
bad += await shot('11-admin-listings', '/admin', { tg: admin });
bad += await shot('12-admin-form', '/admin', { tg: admin, before: async (p) => { await p.waitForSelector('a[href^="#/listings/"]'); await p.locator('a[href^="#/listings/"]:not([href$="new"])').first().click(); await p.waitForTimeout(1200); } });
bad += await shot('13-admin-leads', '/admin', { tg: admin, before: async (p) => { await p.evaluate(() => { location.hash = '#/leads'; }); await p.waitForTimeout(800); } });
bad += await shot('14-admin-stats', '/admin', { tg: admin, before: async (p) => { await p.evaluate(() => { location.hash = '#/stats'; }); await p.waitForTimeout(1000); } });
bad += await shot('15-admin-denied', '/admin', { tg: guest });
// Продавцы (данные оставляет npm run test:e2e: продавцы 777001 и 777002).
const seller = initData({ id: 777001, first_name: 'Продавец', username: 'seller_one' });
const seller2 = initData({ id: 777002, first_name: 'Чужой' });
const firstItem = async (p) => { await p.waitForSelector('a[href^="#/"]'); await p.locator('ul a[href^="#/"]').first().click(); await p.waitForTimeout(1200); };
bad += await shot('16-tg-home-admin-button', '/', { tg: admin, full: false });
bad += await shot('17-sell-list', '/sell', { tg: seller });
bad += await shot('18-sell-status', '/sell', { tg: seller, before: firstItem });
bad += await shot('19-sell-edit', '/sell', { tg: seller2, before: firstItem });
bad += await shot('20-sell-edit-submit', '/sell', { tg: seller2, before: async (p) => { await firstItem(p); await p.getByRole('button', { name: /Отправка/ }).click(); await p.waitForTimeout(800); } });
bad += await shot('21-sell-web', '/sell', { width: 390 });
bad += await shot('22-admin-sellers', '/admin', { tg: admin, before: async (p) => { await p.getByRole('button', { name: /От продавцов/ }).click(); await p.waitForTimeout(1200); } });
bad += await shot('23-admin-seller-form', '/admin', { tg: admin, before: async (p) => { await p.getByRole('button', { name: /От продавцов/ }).click(); await p.waitForTimeout(1000); await p.locator('ul a[href^="#/listings/"]').first().click(); await p.waitForTimeout(1200); } });
// Опрос при первом запуске (предпросмотр /?survey=1).
const fresh = (id) => initData({ id, first_name: 'Новый' });
const click = async (p, name) => { await p.getByRole('button', { name }).first().click(); await p.waitForTimeout(450); };
bad += await shot('24-survey-intent', '/?survey=1', { tg: fresh(880001), full: false, before: async (p) => { await p.waitForSelector('[role=dialog]'); } });
bad += await shot('25-survey-categories', '/?survey=1', { tg: fresh(880002), full: false, before: async (p) => { await click(p, /Хочу купить/); await click(p, /Кафе/); } });
bad += await shot('26-survey-budget', '/?survey=1', { tg: fresh(880003), full: false, before: async (p) => { await click(p, /Хочу купить/); await click(p, /Далее/); await click(p, /Хайфа/); await click(p, /Далее/); } });
bad += await shot('27-survey-wishes', '/?survey=1', { tg: fresh(880004), full: false, before: async (p) => { await click(p, /Хочу купить/); await click(p, /Далее/); await click(p, /Далее/); await click(p, /до ₪ 500 000/); await click(p, /Окупаемость/); } });
bad += await shot('28-survey-buyer-result', '/?survey=1', { tg: fresh(880005), before: async (p) => { await click(p, /Хочу купить/); await click(p, /Далее/); await click(p, /Далее/); await click(p, /до ₪ 500 000/); await click(p, /Готово/); await p.waitForTimeout(600); } });
bad += await shot('29-survey-seller-result', '/?survey=1', { tg: fresh(880006), before: async (p) => { await click(p, /Хочу продать/); await click(p, /Кафе/); await click(p, /Хайфа/); await click(p, /Как можно скорее/); await click(p, /Нужна оценка/); await click(p, /Готово/); await p.waitForTimeout(600); } });
bad += await shot('30-home-for-you', '/', { tg: fresh(880005), before: async (p) => { await p.waitForTimeout(800); } });
bad += await shot('31-survey-dark', '/?survey=1', { tg: fresh(880007), dark: true, full: false, before: async (p) => { await click(p, /Хочу купить/); } });
await browser.close();
if (bad) {
  console.error(`Горизонтальная прокрутка на ${bad} экранах`);
  process.exit(1);
}
