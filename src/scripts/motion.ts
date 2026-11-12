/**
 * Движение и отклик концепции «Закрытый клуб» (DECISIONS №46), без сторонних библиотек:
 * - [data-inview] получает класс .in, когда попадает на экран (кольца окупаемости, печати);
 * - [data-count] — число «докручивается» от нуля до значения (одометр), текст в итоге — как с сервера;
 * - [data-scramble-group] — при нажатии плашки цензуры перебирают случайные буквы и снова закрашиваются;
 * - [data-haptic] — вибрация Telegram при нажатии («select» — выбор, иначе лёгкий удар).
 * При «уменьшении движения» (нет класса .motion-ok) всё показывается сразу, без анимаций.
 */
import { afterSplash, getWebApp, isTg } from './tg';

const motionOk = () => document.documentElement.classList.contains('motion-ok');
const NBSP = ' ';

function group(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

async function haptic(kind: 'select' | 'light' | 'soft' | 'success') {
  if (!isTg()) return;
  const h = (await getWebApp())?.HapticFeedback;
  try {
    if (kind === 'select') h?.selectionChanged?.();
    else if (kind === 'success') h?.notificationOccurred('success');
    else h?.impactOccurred(kind);
  } catch {
    /* старые клиенты */
  }
}

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  const final = el.textContent ?? '';
  if (!Number.isFinite(target) || target <= 0) return;
  // Префикс и суффикс берутся из готового текста: «₪ 750 000» → «₪ » + число.
  const m = /^(\D*)[\d\s ]+(.*)$/.exec(final);
  if (!m) return;
  const [, pre, post] = m;
  const t0 = performance.now();
  const dur = target > 1000 ? 900 : 700;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = k < 1 ? `${pre}${group(target * eased)}${post}` : final;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const GLYPHS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ0123456789';
function scramble(bar: HTMLElement) {
  if (bar.dataset.scramble !== undefined) return;
  const len = Math.max(4, Math.round(bar.offsetWidth / 8.5));
  const t0 = performance.now();
  bar.dataset.scramble = '';
  const tick = (now: number) => {
    if (now - t0 > 900) {
      delete bar.dataset.scramble;
      bar.textContent = '';
      return;
    }
    let s = '';
    for (let i = 0; i < len; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    bar.textContent = s;
    setTimeout(() => requestAnimationFrame(tick), 55);
  };
  requestAnimationFrame(tick);
}

export function initMotion() {
  const inview = document.querySelectorAll<HTMLElement | SVGElement>('[data-inview]');
  const counters = document.querySelectorAll<HTMLElement>('[data-count]');

  if (!motionOk() || !('IntersectionObserver' in window)) {
    inview.forEach((el) => el.classList.add('in'));
  } else afterSplash().then(() => {
    // Не раньше конца заставки — иначе цифры «докрутятся» под ней.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add('in');
          if (el.dataset.count) countUp(el);
          io.unobserve(el);
        }
      },
      { threshold: 0.35 },
    );
    inview.forEach((el) => io.observe(el));
    counters.forEach((el) => io.observe(el));
  });

  // Плашки цензуры: перебор букв и подсказка, что откроется после заявки.
  document.querySelectorAll<HTMLElement>('[data-scramble-group]').forEach((group) => {
    group.addEventListener('click', () => {
      const hint = group.querySelector<HTMLElement>('[data-scramble-hint]');
      if (hint) hint.hidden = false;
      haptic('soft');
      if (motionOk()) group.querySelectorAll<HTMLElement>('.redact').forEach((bar, i) => setTimeout(() => scramble(bar), i * 90));
    });
  });

  // Вибрация при нажатии (только в Telegram).
  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-haptic]');
      if (el) haptic(el.dataset.haptic === 'select' ? 'select' : 'light');
    },
    { capture: true },
  );
}
