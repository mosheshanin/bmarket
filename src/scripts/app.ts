/**
 * Клиентская логика всех публичных страниц.
 * В Telegram: тема, BackButton, MainButton, start_param, кнопка админки, подписка.
 * В браузере: «Поделиться», UTM, статистика.
 */
import {
  captureUtm, fetchSubscription, getWebApp, isTg, requestSubscribe, requestUnsubscribe,
  storageGet, storageSet, tgHeaders, track, afterSplash,
} from './tg';
import { initMotion } from './motion';

const body = document.body;
/** Текст кнопки заявки на карточке — как у кнопки на сайте (src/pages/business/[lot].astro). */
const CTA_TEXT = 'Узнать название и адрес';
const page = body.dataset.page ?? '';
const businessId = body.dataset.businessId ? Number(body.dataset.businessId) : undefined;

captureUtm();
initMotion();

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
  // Палитра «Закрытый клуб» — светлая или тёмная, как в Telegram; шапка, фон и нижняя панель Telegram —
  // в цвет страницы, чтобы не было «шва» (DECISIONS №46).
  const root = document.documentElement;
  const applyScheme = () => {
    const dark = wa.colorScheme === 'dark';
    root.classList.toggle('theme-dark', dark);
    root.classList.toggle('theme-light', !dark);
    storageSet('bm_scheme', dark ? 'dark' : 'light', 'session');
  };
  applyScheme();
  const themeColors = () => {
    try {
      const css = getComputedStyle(root);
      const bg = css.getPropertyValue('--bg').trim() || (wa.colorScheme === 'dark' ? '#13110e' : '#efe9de');
      const card = css.getPropertyValue('--card').trim() || bg;
      wa.setHeaderColor(bg);
      wa.setBackgroundColor(bg);
      if (wa.isVersionAtLeast('7.10')) wa.setBottomBarColor?.(card);
    } catch {
      /* старые клиенты */
    }
  };
  // Нижняя кнопка Telegram — латунная, как кнопки сайта (на всех страницах, где она показывается).
  const buttonColors = () => {
    try {
      const css = getComputedStyle(root);
      const color = css.getPropertyValue('--accent').trim();
      const text = css.getPropertyValue('--accent-text').trim();
      if (color && text) wa.MainButton.setParams?.({ color, text_color: text });
    } catch {
      /* старые клиенты */
    }
  };
  buttonColors();
  wa.onEvent('themeChanged', () => {
    applyScheme();
    buttonColors();
    if (!root.classList.contains('splash-on')) themeColors();
  });
  if (document.documentElement.classList.contains('splash-on')) {
    // Заставка — во весь экран: на телефонах полноэкранный режим Telegram (Bot API 8.0+),
    // иначе шапка и нижняя панель Telegram окрашиваются в чернильный цвет заставки.
    const mobile = wa.platform === 'ios' || wa.platform === 'android';
    let fullscreen = false;
    try {
      wa.setHeaderColor('#13110E');
      wa.setBackgroundColor('#13110E');
      if (wa.isVersionAtLeast('7.10')) wa.setBottomBarColor?.('#13110E');
      if (mobile && wa.isVersionAtLeast('8.0') && wa.requestFullscreen && !wa.isFullscreen) {
        wa.requestFullscreen();
        fullscreen = true;
      }
    } catch {
      themeColors();
    }
    // Возвращаем обычный режим в начале «раскрытия» — под растущим вырезом уже итоговая раскладка приложения.
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      try {
        if (fullscreen && wa.isFullscreen) wa.exitFullscreen?.();
      } catch {
        /* старые клиенты */
      }
      themeColors();
    };
    window.addEventListener('bm:splash-reveal', restore, { once: true });
    afterSplash().then(restore);
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

  // Карточка: «Узнать название и адрес» — системная нижняя кнопка.
  if (page === 'card' && body.dataset.requestPath) {
    const go = () => (location.href = body.dataset.requestPath!);
    wa.MainButton.setText(CTA_TEXT).enable();
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
