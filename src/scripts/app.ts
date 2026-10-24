/**
 * Клиентская логика всех публичных страниц.
 * В Telegram: тема, BackButton, MainButton, start_param, кнопка админки, подписка.
 * В браузере: «Поделиться», UTM, статистика.
 */
import {
  captureUtm, fetchSubscription, getWebApp, isTg, requestSubscribe, requestUnsubscribe,
  storageGet, storageSet, tgHeaders, track, afterSplash,
} from './tg';

const body = document.body;
const page = body.dataset.page ?? '';
const businessId = body.dataset.businessId ? Number(body.dataset.businessId) : undefined;

captureUtm();

// --- статистика ---
if (!storageGet('bm_open', 'session')) {
  storageSet('bm_open', '1', 'session');
  track('app_open');
}
if (page === 'card' && businessId && !location.search.includes('preview=')) track('listing_view', businessId);

// --- «Поделиться» ---
document.querySelectorAll<HTMLButtonElement>('[data-share]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const title = btn.dataset.shareTitle ?? document.title;
    const lot = btn.dataset.shareLot;
    const url = location.origin + location.pathname;
    const wa = await getWebApp();
    if (wa) {
      const link = body.dataset.miniapp && lot ? `${body.dataset.miniapp}?startapp=lot-${lot}` : url;
      wa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* отменено — копируем */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      const old = btn.textContent;
      btn.textContent = 'Ссылка скопирована';
      setTimeout(() => (btn.textContent = old), 2000);
    } catch {
      prompt('Скопируйте ссылку', url);
    }
  });
});

// --- блок подписки (только Telegram) ---
async function initSubscribeBlocks() {
  const blocks = document.querySelectorAll<HTMLElement>('[data-subscribe-block]');
  if (!blocks.length) return;
  const show = (subscribed: boolean) =>
    blocks.forEach((b) => {
      b.querySelector<HTMLElement>('[data-state="idle"]')!.hidden = subscribed;
      b.querySelector<HTMLElement>('[data-state="subscribed"]')!.hidden = !subscribed;
    });
  const state = await fetchSubscription();
  if (state !== null) show(state);
  blocks.forEach((b) => {
    b.querySelector('[data-subscribe]')?.addEventListener('click', async () => {
      if (await requestSubscribe()) show(true);
    });
    b.querySelector('[data-unsubscribe]')?.addEventListener('click', async () => {
      if (await requestUnsubscribe()) show(false);
    });
  });
}

// --- Telegram ---
async function initTelegram() {
  const wa = await getWebApp();
  if (!wa) return;
  wa.ready();
  wa.expand();
  // Во время заставки шапка Telegram — в цвет заставки, потом — в цвет темы.
  const themeColors = () => {
    try {
      wa.setHeaderColor('secondary_bg_color');
      wa.setBackgroundColor('secondary_bg_color');
    } catch {
      /* старые клиенты */
    }
  };
  if (document.documentElement.classList.contains('splash-on')) {
    try {
      wa.setHeaderColor('#0B1630');
      wa.setBackgroundColor('#0B1630');
    } catch {
      themeColors();
    }
    afterSplash().then(themeColors);
  } else {
    themeColors();
  }

  // Прямые ссылки: ?startapp=lot-1001 → карточка; lead-57 → заявка в админке.
  const sp = wa.initDataUnsafe.start_param;
  if (sp && !storageGet('bm_sp', 'session')) {
    storageSet('bm_sp', '1', 'session');
    const lot = /^lot-(\d+)$/.exec(sp);
    const lead = /^lead-(\d+)$/.exec(sp);
    const biz = /^biz-(\d+)$/.exec(sp);
    const sell = /^sell(?:-(\d+))?$/.exec(sp);
    if (lot) return location.replace(`/business/${lot[1]}`);
    if (lead) return location.replace(`/admin#/leads/${lead[1]}`);
    if (biz) return location.replace(`/admin#/listings/${biz[1]}`);
    if (sell) return location.replace(sell[1] ? `/sell?b=${sell[1]}` : '/sell');
  }

  // Системная кнопка «Назад» на внутренних экранах.
  if (page !== 'home' && page !== 'admin' && page !== 'sell') {
    wa.BackButton.show();
    wa.BackButton.onClick(() => {
      const fromSite = document.referrer && new URL(document.referrer).origin === location.origin;
      if (fromSite && history.length > 1) history.back();
      else location.href = '/';
    });
  } else if (page === 'home') {
    wa.BackButton.hide();
  }

  // Карточка: «Узнать подробнее» — системная нижняя кнопка.
  if (page === 'card' && body.dataset.requestPath) {
    const go = () => (location.href = body.dataset.requestPath!);
    wa.MainButton.setText('Узнать подробнее').enable();
    wa.MainButton.onClick(go);
    afterSplash().then(() => wa.MainButton.show());
    window.addEventListener('pagehide', () => wa.MainButton.offClick(go));
  } else if (page !== 'request' && page !== 'admin' && page !== 'sell') {
    wa.MainButton.hide();
  }

  // Кнопка «Админ-панель» — только на главной и только администраторам (сервер всё равно проверяет каждый запрос).
  if (page === 'home') try {
    const r = await fetch('/api/me', { headers: await tgHeaders() });
    if (r.ok && ((await r.json()) as { isAdmin?: boolean }).isAdmin) {
      const a = document.getElementById('admin-link');
      if (a) a.style.display = 'inline-flex';
    }
  } catch {
    /* нет сети */
  }

  initSubscribeBlocks();

  // Опрос при первом запуске и «Подборка для вас» — отдельный модуль, грузится только в Telegram на главной.
  if (page === 'home') import('../onboarding').then((m) => m.initOnboarding()).catch((e) => console.warn('onboarding', e));
}

if (isTg()) initTelegram();

// Возврат по «Назад» из bfcache: снова показать кнопку на карточке.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && isTg() && page === 'card') getWebApp().then((wa) => wa?.MainButton.show());
});
