import { useCallback, useEffect, useRef, useState } from 'react';
import { api as rawApi, ApiError } from '../admin/api';
import { ErrorBox, Field, NumberInput, Section, Spinner, ToastProvider, confirmDialog, dt, fmtNum, useToast } from '../admin/ui';
import MarkdownEditor from '../admin/MarkdownEditor';
import PhotoManager from '../admin/PhotoManager';
import type { BusinessDetail, Photo } from '../admin/types';
import { getWebApp, isTg, storageGet, storageSet } from '../scripts/tg';
import { EXTRAS, EXTRAS_WHY, extraPrice, orderTotal } from '../lib/extras';
import { INCLUDED_LABELS, LEGAL_FORM_LABELS, LICENSE_LABELS, formatPayback, groupDigits, paybackMonths } from '../lib/format';
import { PROMO } from '../lib/promo';

/**
 * «Мои объявления» — продавец сам заполняет объявление (черновик сохраняется автоматически),
 * отправляет заявку на размещение (оплату согласует менеджер); после оплаты правки — только запросом администратору.
 */

const BASE = '/api/seller/';
const api = <T,>(path: string, opts: Parameters<typeof rawApi>[1] = {}) => rawApi<T>(path, { ...opts, base: BASE });

type Stage = 'editing' | 'awaiting_payment' | 'in_review' | 'approved';
interface Dict { id: number; name: string }
interface Me {
  user: { id: number; firstName: string; username: string | null };
  items: Row[];
  cities: Dict[];
  categories: Dict[];
  priceIls: number;
  autoPublish: boolean;
  payment: { paypal: boolean; mode: 'live' | 'sandbox' };
}
interface Row {
  id: number; lotNumber: number; publicTitle: string; status: 'draft' | 'published' | 'hidden'; sellerStage: Stage | null;
  priceIls: number | null; cityName: string | null; updatedAt: number; path: string; cover: string | null;
}
const FIELDS = [
  'publicTitle', 'categoryId', 'cityId', 'areaNote', 'priceIls', 'priceNegotiable', 'monthlyRevenueIls', 'monthlyProfitIls',
  'yearFounded', 'employeesCount', 'areaSqm', 'rentMonthlyIls', 'leaseUntil', 'legalForm', 'businessLicense', 'includedInSale',
  'ownerSupport', 'reasonForSale', 'shortDescription', 'description', 'videoUrl', 'realName', 'exactAddress', 'ownerName',
  'ownerPhone', 'ownerTelegram', 'extrasOrdered',
] as const;
type Form = {
  publicTitle: string; categoryId: number | null; cityId: number | null; areaNote: string | null; priceIls: number | null;
  priceNegotiable: boolean; monthlyRevenueIls: number | null; monthlyProfitIls: number | null; yearFounded: number | null;
  employeesCount: number | null; areaSqm: number | null; rentMonthlyIls: number | null; leaseUntil: string | null;
  legalForm: string | null; businessLicense: string | null; includedInSale: string[]; ownerSupport: string | null;
  reasonForSale: string | null; shortDescription: string; description: string; videoUrl: string | null; realName: string | null;
  exactAddress: string | null; ownerName: string | null; ownerPhone: string | null; ownerTelegram: string | null;
  extrasOrdered: string[];
};
interface Detail {
  business: Form & { id: number; lotNumber: number; status: Row['status']; sellerStage: Stage | null; updatedAt: number; publishedAt: number | null };
  photos: Photo[];
  missing: string[];
  path: string;
  paid: boolean;
  paymentPending: boolean;
  editRequests: { id: number; text: string; status: 'new' | 'done' | 'rejected'; adminNote: string | null; createdAt: number; handledAt: number | null }[];
  priceIls: number;
  valuationPriceIls: number;
  auditPriceIls: number;
  /** К оплате: размещение + заказанные услуги (₪). */
  total: number;
  autoPublish: boolean;
  payment: Me['payment'];
}

function stageLabel(r: { status: Row['status']; sellerStage: Stage | null }): [string, string] {
  if (r.status === 'published') return ['Опубликовано', 'bg-success/15 text-success'];
  if (r.status === 'hidden') return ['Снято с публикации', 'bg-hint/15 text-hint'];
  if (r.sellerStage === 'awaiting_payment') return ['Заявка отправлена', 'bg-warn text-text'];
  if (r.sellerStage === 'in_review') return ['На проверке', 'bg-accent/15 text-accent'];
  return ['Черновик', 'bg-hint/15 text-hint'];
}

const ils = (n: number) => `₪ ${fmtNum(n)}`;

// ---------- маршруты ----------
/**
 * Экран — в hash (#/edit/5, #/b/5); прямые ссылки из бота — в query (?b=5, ?edit=5),
 * потому что Telegram дописывает свои параметры (tgWebAppData…) в hash.
 */
function parseRoute(): string[] {
  const h = location.hash.replace(/^#/, '').split(/[&?]/)[0];
  if (h.startsWith('/')) return h.slice(1).split('/').filter(Boolean);
  const q = new URLSearchParams(location.search);
  if (q.get('b')) return ['b', q.get('b')!];
  if (q.get('edit')) return ['edit', q.get('edit')!];
  return [];
}
function useRoute() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const on = () => setRoute(parseRoute());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return route;
}
const go = (hash: string, replace = false) => {
  const url = location.pathname + (hash || '#/');
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

export default function SellerApp({ botLink }: { botLink: string | null }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const route = useRoute();
  const [screen, rawSub] = route;
  const sub = rawSub ? String(parseInt(rawSub, 10) || '') : '';

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>('me'));
      setError(null);
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : 0, text: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    (async () => {
      const wa = await getWebApp();
      if (!wa?.initData) {
        setError({ status: 401, text: '' });
        return;
      }
      wa.MainButton.hide();
      reload();
    })();
  }, [reload]);

  // Системная «Назад»: с внутреннего экрана — к списку, со списка — в каталог.
  useEffect(() => {
    let off: (() => void) | undefined;
    getWebApp().then((wa) => {
      if (!wa) return;
      const back = () => (screen ? go('#/') : (location.href = '/'));
      wa.BackButton.show();
      wa.BackButton.onClick(back);
      off = () => wa.BackButton.offClick(back);
    });
    return () => off?.();
  }, [screen]);

  if (error?.status === 401 || (!isTg() && !me)) return <OpenInTelegram botLink={botLink} />;
  if (error) return <div className="mx-auto max-w-md pt-6"><ErrorBox error={error.text} onRetry={reload} /></div>;
  if (!me) return <Spinner />;

  let view;
  if (screen === 'edit' && sub) view = <EditForm key={sub} id={Number(sub)} me={me} onChanged={reload} />;
  else if (screen === 'b' && sub) view = <Status key={sub} id={Number(sub)} onChanged={reload} />;
  else view = <MyListings me={me} onChanged={reload} />;
  return <ToastProvider><div className="mx-auto max-w-2xl">{view}</div></ToastProvider>;
}

function OpenInTelegram({ botLink }: { botLink: string | null }) {
  return (
    <section className="card mx-auto mt-4 max-w-md p-6 text-center">
      <h1 className="text-xl font-extrabold">Разместить объявление о продаже</h1>
      <p className="mt-2 text-hint">Объявления подаются через Telegram: так мы сохраняем ваш черновик и сообщаем о публикации. Это займёт около 10 минут.</p>
      {botLink ? <a className="btn btn-primary mt-4 w-full" href={botLink}>Открыть в Telegram</a> : <p className="mt-4 text-hint">Telegram-бот ещё не настроен.</p>}
    </section>
  );
}

/** «Ваше объявление заметят»: где рекламируется каталог и сколько у него посетителей. */
function PromoBlock() {
  const names = PROMO.channels.map((c) => c.name);
  return (
    <section className="promo-block" aria-labelledby="promo-title">
      <div className="promo-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="promo-body">
        <h2 id="promo-title" className="promo-title">Ваше объявление заметят</h2>
        <p className="promo-text">
          Мы запустили рекламу каталога в {names.slice(0, -1).join(', ')} и&nbsp;{names[names.length - 1]}. Покупатели приходят к&nbsp;нам сами.
        </p>
        <div className="promo-stat">
          <span className="promo-num">{groupDigits(PROMO.monthlyVisitors)}</span>
          <span className="promo-cap">посетителей каталога в&nbsp;месяц</span>
        </div>
        <ul className="promo-channels" aria-label="Где идёт реклама">
          {PROMO.channels.map((c) => (
            <li key={c.name}><img src={c.icon} alt="" width="18" height="18" />{c.name}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- список ----------
function MyListings({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // Пришли из опроса («Разместить объявление»): открыть начатый черновик или создать новый со сферой и городом.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('new') !== '1') return;
    history.replaceState(null, '', location.pathname + location.hash);
    const draft = me.items.find((r) => r.status === 'draft' && r.sellerStage === 'editing');
    if (draft) return go(`#/edit/${draft.id}`, true);
    const prefill: Record<string, number> = {};
    if (Number(q.get('category'))) prefill.categoryId = Number(q.get('category'));
    if (Number(q.get('city'))) prefill.cityId = Number(q.get('city'));
    create(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeDraft(r: Row) {
    if (!(await confirmDialog(`Удалить черновик №${r.lotNumber}${r.publicTitle ? ` «${r.publicTitle}»` : ''}? Это нельзя отменить.`))) return;
    try {
      await api(`businesses/${r.id}`, { method: 'DELETE' });
      storageSet(localKey(r.id), '');
      toast('Черновик удалён');
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function create(prefill: Record<string, number> = {}) {
    setBusy(true);
    try {
      const d = await api<Detail>('businesses', { method: 'POST', body: prefill });
      onChanged();
      go(`#/edit/${d.business.id}`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-extrabold">Мои объявления</h1>
      <PromoBlock />
      <section className="card p-4 text-sm">
        <p className="font-semibold">Как это работает</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-hint">
          <li>Заполните объявление — черновик сохраняется автоматически, вернуться можно в любой момент.</li>
          <li>Отправьте заявку на размещение{me.priceIls > 0 ? <> — менеджер свяжется и согласует оплату (<b className="text-text">{ils(me.priceIls)}</b>)</> : ''}.</li>
          <li>{me.autoPublish ? 'Объявление сразу появится в каталоге' : 'После проверки администратором объявление появится в каталоге'}. Название и адрес бизнеса посетители не увидят.</li>
          <li>Изменить опубликованное объявление можно через запрос администратору.</li>
        </ol>
      </section>
      <button className="btn btn-primary w-full" onClick={() => create()} disabled={busy}>+ Новое объявление</button>
      <ul className="flex flex-col gap-2">
        {me.items.map((r) => {
          const [label, tone] = stageLabel(r);
          const href = r.status === 'draft' && r.sellerStage === 'editing' ? `#/edit/${r.id}` : `#/b/${r.id}`;
          const deletable = r.status === 'draft' && (r.sellerStage === 'editing' || r.sellerStage === 'awaiting_payment');
          return (
            <li key={r.id} className="relative">
              {deletable && (
                <button type="button" onClick={() => removeDraft(r)} aria-label={`Удалить черновик №${r.lotNumber}`}
                  className="absolute right-1.5 top-1.5 z-10 flex h-10 w-10 items-center justify-center rounded-full text-hint hover:bg-danger/10 hover:text-danger">
                  <TrashIcon />
                </button>
              )}
              <a href={href} className={`card flex gap-3 p-2.5 text-text no-underline ${deletable ? 'pr-12' : ''}`}>
                <div className="h-[72px] w-24 shrink-0 overflow-hidden rounded-lg bg-line">
                  {r.cover && <img src={r.cover} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-hint">№{r.lotNumber}{r.cityName ? ` · ${r.cityName}` : ''} · изменено {dt(r.updatedAt)}</p>
                  <p className="truncate font-semibold">{r.publicTitle || 'Без названия'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`badge ${tone}`}>{label}</span>
                    {r.priceIls ? <span>{ils(r.priceIls)}</span> : null}
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

// ---------- форма ----------
const STEPS = ['Основное', 'Цифры', 'Описание', 'Фото', 'Контакты', 'Отправка'] as const;
const STEP_OF: Record<string, number> = {
  'название': 0, 'город': 0, 'отрасль': 0, 'цена': 0, 'краткое описание': 0,
  'полное описание': 2, 'минимум 1 фото': 3, 'ваш телефон': 4,
};
const SAVE_DELAY = 1500;
const localKey = (id: number) => `bm_sell_draft_${id}`;

function pick(b: Detail['business']): Form {
  const f = {} as Record<string, unknown>;
  for (const k of FIELDS) f[k] = b[k];
  return f as Form;
}
function payload(f: Form) {
  const out: Record<string, unknown> = {};
  for (const k of FIELDS) {
    const v = f[k];
    out[k] = typeof v === 'string' && v.trim() === '' && !['publicTitle', 'shortDescription', 'description'].includes(k) ? null : v;
  }
  return out;
}

function EditForm({ id, me, onChanged }: { id: number; me: Me; onChanged: () => void }) {
  const toast = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [state, setState] = useState<'saved' | 'dirty' | 'saving' | 'offline' | 'conflict'>('saved');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Подсвечивать незаполненное — после первого захода на шаг «Отправка». */
  const [tried, setTried] = useState(false);
  /** Пройденные шаги — отмечаются галочкой, если на них всё заполнено. */
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  const formRef = useRef<Form | null>(null);
  formRef.current = form;
  const detailRef = useRef<Detail | null>(null);
  detailRef.current = detail;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`businesses/${id}`);
      if (d.business.status !== 'draft' || d.business.sellerStage !== 'editing') {
        go(`#/b/${id}`, true);
        return;
      }
      setDetail(d);
      let f = pick(d.business);
      // Изменения, которые не успели уйти на сервер (нет сети, закрыли приложение).
      try {
        const raw = storageGet(localKey(id));
        if (raw) {
          const saved = JSON.parse(raw) as { form: Form; base: number };
          if (saved.base === d.business.updatedAt) {
            f = saved.form;
            setState('dirty');
          } else storageSet(localKey(id), '');
        }
      } catch { /* повреждённая копия */ }
      setForm(f);
      setSavedAt(d.business.updatedAt);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) await saving.current;
    const f = formRef.current;
    const d = detailRef.current;
    if (!f || !d) return false;
    saving.current = (async () => {
      setState('saving');
      try {
        const nd = await api<Detail>(`businesses/${id}`, { method: 'PUT', body: { ...payload(f), expectedUpdatedAt: d.business.updatedAt } });
        setDetail(nd);
        storageSet(localKey(id), '');
        setSavedAt(Date.now());
        // Пока шёл запрос, пользователь мог продолжить печатать.
        setState(formRef.current === f ? 'saved' : 'dirty');
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setState('conflict');
          return false;
        }
        storageSet(localKey(id), JSON.stringify({ form: f, base: d.business.updatedAt }));
        setState('offline');
        return false;
      } finally {
        saving.current = null;
      }
    })();
    return saving.current;
  }, [id]);

  // Автосохранение: через 1,5 с после последнего изменения.
  useEffect(() => {
    if (state !== 'dirty') return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form, state, save]);
  // Повтор при восстановлении сети и сохранение при сворачивании приложения.
  useEffect(() => {
    const online = () => state === 'offline' && save();
    const hide = () => document.visibilityState === 'hidden' && (state === 'dirty' || state === 'offline') && save();
    window.addEventListener('online', online);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('online', online);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [state, save]);

  if (error) return <div className="flex flex-col gap-3"><a href="#/" onClick={(e) => { e.preventDefault(); go('#/'); }} className="text-sm">← Мои объявления</a><ErrorBox error={error} onRetry={load} /></div>;
  if (!detail || !form) return <Spinner />;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setState((s) => (s === 'conflict' ? s : 'dirty'));
  };
  const str = (v: string | null) => v ?? '';
  const missing = detail.missing;
  const miss = (label: string) => (tried && missing.includes(label) ? 'Обязательно' : undefined);
  const payback = paybackMonths(form.priceIls, form.monthlyProfitIls);

  async function goStep(n: number) {
    if (state === 'dirty' || state === 'offline') await save();
    if (n === STEPS.length - 1) setTried(true);
    setVisited((v) => new Set(v).add(step).add(n));
    setStep(n);
    window.scrollTo({ top: 0 });
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (state !== 'saved' && !(await save())) {
        toast('Не удалось сохранить — проверьте интернет', 'error');
        return;
      }
      const d = await api<Detail>(`businesses/${id}/submit`, { method: 'POST' });
      (await getWebApp())?.HapticFeedback?.notificationOccurred('success');
      onChanged();
      go(`#/b/${d.business.id}`, true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const m = (e.data.missing as string[]) ?? [];
        setDetail({ ...detail!, missing: m });
        if (m.length) setStep(STEP_OF[m[0]] ?? 0);
      }
      toast((e as Error).message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog('Удалить черновик? Это нельзя отменить.'))) return;
    try {
      await api(`businesses/${id}`, { method: 'DELETE' });
      storageSet(localKey(id), '');
      onChanged();
      go('#/', true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const status = {
    saved: savedAt ? `Черновик сохранён ${dt(savedAt)}` : 'Черновик сохранён',
    dirty: 'Есть изменения…',
    saving: 'Сохраняем…',
    offline: 'Нет связи — изменения сохранены в телефоне и отправятся позже',
    conflict: 'Черновик изменён на другом устройстве',
  }[state];

  return (
    <div className="flex flex-col gap-3">
      <div>
        <a href="#/" onClick={(e) => { e.preventDefault(); go('#/'); }} className="text-sm">← Мои объявления</a>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-extrabold">Объявление №{detail.business.lotNumber}</h1>
          <button type="button" onClick={remove} className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-danger hover:bg-danger/10" aria-label="Удалить черновик">
            <TrashIcon /> Удалить
          </button>
        </div>
        <p className={`text-xs ${state === 'offline' || state === 'conflict' ? 'text-danger' : 'text-hint'}`} aria-live="polite">{status}</p>
      </div>
      {state === 'conflict' && (
        <div className="card border-2 border-danger p-3 text-sm" role="alert">
          <p>Черновик открыт и изменён в другом месте. Загрузите актуальную версию.</p>
          <button className="btn btn-primary mt-2" onClick={() => { setState('saved'); storageSet(localKey(id), ''); load(); }}>Загрузить</button>
        </div>
      )}

      {/* Все шаги видны сразу: сетка 3×2 вместо прокручиваемой ленты. */}
      <nav className="grid grid-cols-3 gap-1.5" aria-label="Шаги">
        {STEPS.map((s, i) => {
          const bad = tried && missing.some((m) => STEP_OF[m] === i);
          const done = visited.has(i) && i !== step && !missing.some((m) => STEP_OF[m] === i);
          return (
            <button key={s} type="button" aria-current={step === i ? 'step' : undefined} onClick={() => goStep(i)}
              className={`step-tab ${step === i ? 'step-tab-on' : ''}`}>
              <span className={`step-num ${bad ? 'step-num-bad' : done ? 'step-num-done' : ''}`}>{bad ? '!' : done ? '✓' : i + 1}</span>
              <span className="truncate">{s}</span>
            </button>
          );
        })}
      </nav>

      {step === 0 && (
        <Section title="Основное">
          <Field label="Название для каталога" htmlFor="s-title" hint={`${form.publicTitle.length}/80 · без реального названия и адреса, например «Кофейня с террасой в центре Хайфы»`} error={miss('название')}>
            <input id="s-title" className="field" maxLength={80} value={form.publicTitle} onChange={(e) => set('publicTitle', e.target.value)} placeholder="Кофейня с террасой в центре Хайфы" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Город" htmlFor="s-city" error={miss('город')}>
              <select id="s-city" className="field" value={form.cityId ?? ''} onChange={(e) => set('cityId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— выберите —</option>
                {me.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Отрасль" htmlFor="s-cat" error={miss('отрасль')}>
              <select id="s-cat" className="field" value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
                <option value="">— выберите —</option>
                {me.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Район (без адреса)" htmlFor="s-area" hint="Например: центр города, рядом с набережной">
            <input id="s-area" className="field" maxLength={120} value={str(form.areaNote)} onChange={(e) => set('areaNote', e.target.value)} />
          </Field>
          <Field label="Цена продажи" htmlFor="s-price" error={miss('цена')}>
            <NumberInput id="s-price" value={form.priceIls} onChange={(v) => set('priceIls', v)} suffix="₪" placeholder="450 000" />
          </Field>
          <label className="flex min-h-[44px] items-center gap-3">
            <input type="checkbox" className="h-5 w-5" checked={form.priceNegotiable} onChange={(e) => set('priceNegotiable', e.target.checked)} />
            <span>Торг возможен</span>
          </label>
          <Field label="Кратко о бизнесе" htmlFor="s-short" hint={`${form.shortDescription.length}/200 · одна-две фразы для списка`} error={miss('краткое описание')}>
            <textarea id="s-short" className="field min-h-20" maxLength={200} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
          </Field>
        </Section>
      )}

      {step === 1 && (
        <Section title="Цифры" hint="необязательно, но повышает интерес">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Оборот в месяц" htmlFor="s-rev"><NumberInput id="s-rev" value={form.monthlyRevenueIls} onChange={(v) => set('monthlyRevenueIls', v)} suffix="₪" /></Field>
            <Field label="Чистая прибыль в месяц" htmlFor="s-profit" hint={payback ? `Окупаемость: ${formatPayback(payback)}` : 'Окупаемость посчитается автоматически'}>
              <NumberInput id="s-profit" value={form.monthlyProfitIls} onChange={(v) => set('monthlyProfitIls', v)} suffix="₪" />
            </Field>
            <Field label="Аренда в месяц" htmlFor="s-rent"><NumberInput id="s-rent" value={form.rentMonthlyIls} onChange={(v) => set('rentMonthlyIls', v)} suffix="₪" /></Field>
            <Field label="Договор аренды до" htmlFor="s-lease">
              <input id="s-lease" type="date" className="field" value={str(form.leaseUntil)} onChange={(e) => set('leaseUntil', e.target.value || null)} />
            </Field>
            <Field label="Год открытия" htmlFor="s-year"><NumberInput id="s-year" value={form.yearFounded} onChange={(v) => set('yearFounded', v && v > 2100 ? 2100 : v)} /></Field>
            <Field label="Сотрудников" htmlFor="s-emp"><NumberInput id="s-emp" value={form.employeesCount} onChange={(v) => set('employeesCount', v)} /></Field>
            <Field label="Площадь помещения" htmlFor="s-sqm"><NumberInput id="s-sqm" value={form.areaSqm} onChange={(v) => set('areaSqm', v)} suffix="м²" /></Field>
            <Field label="Форма собственности" htmlFor="s-legal">
              <select id="s-legal" className="field" value={form.legalForm ?? ''} onChange={(e) => set('legalForm', e.target.value || null)}>
                <option value="">—</option>
                {Object.entries(LEGAL_FORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Лицензия на бизнес" htmlFor="s-lic">
              <select id="s-lic" className="field" value={form.businessLicense ?? ''} onChange={(e) => set('businessLicense', e.target.value || null)}>
                <option value="">—</option>
                {Object.entries(LICENSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section title="Описание">
          <Field label="Подробное описание" htmlFor="s-desc" hint="Что за бизнес, клиенты, сезонность, перспективы. Без названия и адреса." error={miss('полное описание')}>
            <MarkdownEditor id="s-desc" value={form.description} onChange={(v) => set('description', v)} />
          </Field>
          <Field label="Что входит в продажу">
            <div className="flex flex-wrap gap-2">
              {Object.entries(INCLUDED_LABELS).map(([k, v]) => {
                const on = form.includedInSale.includes(k);
                return (
                  <button key={k} type="button" className="chip !min-h-[40px] !text-sm" aria-current={on ? 'page' : undefined}
                    onClick={() => set('includedInSale', on ? form.includedInSale.filter((x) => x !== k) : [...form.includedInSale, k])}>
                    {on ? '✓ ' : ''}{v}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Передача дел" htmlFor="s-support" hint="Например: 2 недели обучения нового владельца">
            <input id="s-support" className="field" maxLength={300} value={str(form.ownerSupport)} onChange={(e) => set('ownerSupport', e.target.value)} />
          </Field>
          <Field label="Причина продажи" htmlFor="s-reason">
            <textarea id="s-reason" className="field min-h-20" maxLength={1000} value={str(form.reasonForSale)} onChange={(e) => set('reasonForSale', e.target.value)} />
          </Field>
        </Section>
      )}

      {step === 3 && (
        <Section title="Фото и видео">
          {miss('минимум 1 фото') && <p className="text-sm text-danger">Добавьте хотя бы одно фото</p>}
          <p className="text-sm text-hint">Без вывески, названия и номера дома на фото — их увидят все.</p>
          <PhotoManager
            photos={detail.photos}
            ensureId={async () => id}
            onDetail={(d) => setDetail(d as unknown as Detail)}
            apiBase={BASE}
            allowAlt={false}
          />
          <Field label="Видео YouTube (необязательно)" htmlFor="s-video">
            <input id="s-video" className="field" inputMode="url" value={str(form.videoUrl)} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://youtu.be/…" />
          </Field>
        </Section>
      )}

      {step === 4 && (
        <Section title="Контакты и скрытые данные" tone="secret" hint="🔒 видит только администратор">
          <p className="text-sm text-hint">Покупатели не увидят эти данные: менеджер свяжется с вами и сам представит покупателя.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Ваше имя" htmlFor="s-oname"><input id="s-oname" className="field" maxLength={120} value={str(form.ownerName)} onChange={(e) => set('ownerName', e.target.value)} /></Field>
            <Field label="Телефон" htmlFor="s-ophone" error={miss('ваш телефон')}>
              <input id="s-ophone" className="field" type="tel" inputMode="tel" maxLength={40} value={str(form.ownerPhone)} onChange={(e) => set('ownerPhone', e.target.value)} placeholder="+972 50 123 4567" />
            </Field>
            <Field label="Telegram" htmlFor="s-otg"><input id="s-otg" className="field" maxLength={64} value={str(form.ownerTelegram)} onChange={(e) => set('ownerTelegram', e.target.value)} placeholder="@username" /></Field>
          </div>
          <Field label="Реальное название бизнеса" htmlFor="s-real"><input id="s-real" className="field" maxLength={200} value={str(form.realName)} onChange={(e) => set('realName', e.target.value)} /></Field>
          <Field label="Точный адрес" htmlFor="s-addr"><input id="s-addr" className="field" maxLength={300} value={str(form.exactAddress)} onChange={(e) => set('exactAddress', e.target.value)} /></Field>
        </Section>
      )}

      {step === 5 && (
        <Section title="Отправка">
          {missing.length > 0 ? (
            <div className="rounded-card bg-danger/10 p-3 text-sm">
              <p className="font-semibold text-danger">Осталось заполнить:</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {missing.map((m) => (
                  <li key={m}><button type="button" className="chip !min-h-[36px] !text-sm" onClick={() => goStep(STEP_OF[m] ?? 0)}>{m}</button></li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-card bg-success/10 p-3 text-sm">Всё заполнено — можно отправлять.</p>
          )}
          <div className="flex flex-col gap-2">
            <div className="tinted tone-green p-3.5">
              <p className="font-semibold">Продайте быстрее и дороже</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {EXTRAS_WHY.map((t) => (
                  <li key={t} className="flex gap-2"><span className="tone-text font-bold" aria-hidden="true">✓</span><span>{t}</span></li>
                ))}
              </ul>
            </div>
            <p className="mt-1 text-sm font-semibold">Дополнительные услуги</p>
            {EXTRAS.map((x) => {
              const on = (form.extrasOrdered ?? []).includes(x.key);
              return (
                <label key={x.key} className={`survey-option !items-start !gap-3 ${detail.paid ? 'opacity-60' : ''}`} aria-pressed={on}>
                  <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={on} disabled={detail.paid}
                    onChange={(e) => set('extrasOrdered', e.target.checked ? [...(form.extrasOrdered ?? []), x.key] : (form.extrasOrdered ?? []).filter((k) => k !== x.key))} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-semibold">{x.title}</span>
                      <span className="font-bold">{ils(extraPrice(detail, x.key))}</span>
                    </span>
                    <span className="mt-0.5 block text-sm">{x.why}</span>
                    <span className="mt-1 block text-xs text-hint">{x.sell}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {(() => {
            const order = orderTotal(detail, form.extrasOrdered ?? []);
            return (
              <>
                <ul className="flex flex-col gap-1 text-sm">
                  {detail.paid ? (
                    <li className="text-hint">Уже оплачено — повторно платить не нужно.</li>
                  ) : (
                    <>
                      {detail.priceIls > 0 && <li className="flex justify-between"><span className="text-hint">Размещение</span><span>{ils(detail.priceIls)}</span></li>}
                      {EXTRAS.filter((x) => (form.extrasOrdered ?? []).includes(x.key)).map((x) => (
                        <li key={x.key} className="flex justify-between"><span className="text-hint">{x.title}</span><span>{ils(extraPrice(detail, x.key))}</span></li>
                      ))}
                      <li className="flex justify-between border-t border-line pt-1 font-bold"><span>Итого</span><span>{order.totalIls > 0 ? ils(order.totalIls) : 'бесплатно'}</span></li>
                      {order.totalIls > 0 && <li className="text-hint">Оплата — после звонка менеджера, удобным для вас способом. Онлайн платить не нужно.</li>}
                    </>
                  )}
                </ul>
                <ul className="flex flex-col gap-1 text-sm text-hint">
                  <li>{detail.autoPublish ? 'После оплаты объявление сразу появится в каталоге.' : 'После оплаты объявление проверит администратор и опубликует.'}</li>
                  {(form.extrasOrdered ?? []).length > 0 && <li>Оценку и аудит эксперты проводят после публикации; бейдж появится, когда работа будет завершена.</li>}
                  <li>После отправки изменить объявление можно только через запрос администратору.</li>
                </ul>
                <button className="btn btn-primary w-full" onClick={submit} disabled={submitting || state === 'conflict'}>
                  {submitting ? 'Отправляем…' : detail.paid || order.totalIls === 0 ? 'Отправить объявление' : 'Отправить заявку на размещение'}
                </button>
              </>
            );
          })()}
          <button className="btn btn-secondary w-full text-danger" onClick={remove}>Удалить черновик</button>
        </Section>
      )}

      <div className="flex gap-2">
        {step > 0 && <button className="btn btn-secondary flex-1" onClick={() => goStep(step - 1)}>← Назад</button>}
        {step < STEPS.length - 1 && <button className="btn btn-primary flex-1" onClick={() => goStep(step + 1)}>Далее →</button>}
      </div>
    </div>
  );
}

// ---------- статус, оплата, запросы на изменение ----------
function Status({ id, onChanged }: { id: number; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    try {
      const nd = await api<Detail>(`businesses/${id}`);
      if (nd.business.status === 'draft' && nd.business.sellerStage === 'editing') {
        go(`#/edit/${id}`, true);
        return;
      }
      setD(nd);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);
  // Вернулись из PayPal (внешний браузер) — обновить статус; пока ждём оплату — проверять каждые 5 с.
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', on);
    const t = waiting ? setInterval(load, 5000) : undefined;
    return () => {
      document.removeEventListener('visibilitychange', on);
      if (t) clearInterval(t);
    };
  }, [load, waiting]);
  useEffect(() => {
    if (d && d.business.sellerStage !== 'awaiting_payment') setWaiting(false);
  }, [d]);

  if (error) return <div className="flex flex-col gap-3"><a href="#/" onClick={(e) => { e.preventDefault(); go('#/'); }} className="text-sm">← Мои объявления</a><ErrorBox error={error} onRetry={load} /></div>;
  if (!d) return <Spinner />;
  const b = d.business;
  const [label, tone] = stageLabel(b);

  async function pay() {
    setBusy(true);
    try {
      const r = await api<{ approveUrl: string }>(`businesses/${id}/pay`, { method: 'POST' });
      const wa = await getWebApp();
      setWaiting(true);
      // PayPal открывается во внешнем браузере: внутри Telegram его окна работают ненадёжно.
      if (wa) wa.openLink(r.approveUrl);
      else location.href = r.approveUrl;
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function backToEdit() {
    try {
      await api(`businesses/${id}/edit`, { method: 'POST' });
      onChanged();
      go(`#/edit/${id}`, true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function remove() {
    if (!(await confirmDialog('Удалить объявление? Это нельзя отменить.'))) return;
    try {
      await api(`businesses/${id}`, { method: 'DELETE' });
      onChanged();
      go('#/', true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function sendRequest() {
    setBusy(true);
    try {
      setD(await api<Detail>(`businesses/${id}/edit-requests`, { body: { text } }));
      setText('');
      toast('Запрос отправлен администратору');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const awaiting = b.status === 'draft' && b.sellerStage === 'awaiting_payment';
  return (
    <div className="flex flex-col gap-3">
      <div>
        <a href="#/" onClick={(e) => { e.preventDefault(); go('#/'); }} className="text-sm">← Мои объявления</a>
        <h1 className="text-xl font-extrabold">№{b.lotNumber} · {b.publicTitle || 'Без названия'}</h1>
        <span className={`badge mt-1 ${tone}`}>{label}</span>
      </div>
      {d.photos[0] && <img src={d.photos[0].url} alt="" className="aspect-[4/3] w-full rounded-card object-cover" />}

      {awaiting && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-base font-bold">{d.payment.paypal ? `К оплате · ${ils(d.total)}` : 'Заявка на размещение отправлена'}</h2>
          {(d.business.extrasOrdered ?? []).length > 0 && (
            <p className="text-sm text-hint">
              {[d.priceIls > 0 && `размещение ${ils(d.priceIls)}`, ...EXTRAS.filter((x) => d.business.extrasOrdered.includes(x.key)).map((x) => `${x.title.toLowerCase()} ${ils(extraPrice(d, x.key))}`)].filter(Boolean).join(' · ')}
            </p>
          )}
          {d.paymentPending ? (
            <p className="text-sm">⏳ PayPal обрабатывает платёж. Как только он завершится, объявление обработается автоматически.</p>
          ) : d.payment.paypal ? (
            <>
              <p className="text-sm text-hint">Откроется страница PayPal: можно оплатить картой или аккаунтом PayPal. После оплаты вернитесь в Telegram — статус обновится сам.</p>
              {d.payment.mode === 'sandbox' && <p className="rounded-card bg-warn p-2 text-xs">Тестовый режим PayPal: настоящие деньги не списываются.</p>}
              <button className="btn btn-primary w-full" onClick={pay} disabled={busy}>{busy ? 'Открываем PayPal…' : 'Оплатить через PayPal'}</button>
              {waiting && <button className="btn btn-secondary w-full" onClick={load}>Я оплатил — проверить</button>}
            </>
          ) : (
            <p className="text-sm">Менеджер получил заявку и свяжется с вами в рабочее время, чтобы согласовать оплату <b>{ils(d.total)}</b>. {d.autoPublish ? 'После подтверждения оплаты объявление сразу появится в каталоге.' : 'После подтверждения оплаты объявление проверят и опубликуют.'}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary flex-1" onClick={backToEdit}>Изменить объявление</button>
            <button className="btn btn-secondary text-danger" onClick={remove}>Удалить</button>
          </div>
        </section>
      )}

      {b.status === 'draft' && b.sellerStage === 'in_review' && (
        <p className="card p-4 text-sm">✅ {d.paid ? 'Оплата получена. ' : ''}Объявление на проверке у администратора — после публикации бот пришлёт сообщение.</p>
      )}
      {b.status === 'published' && (
        <section className="card flex flex-col gap-2 p-4 text-sm">
          <p>✅ Объявление опубликовано{b.publishedAt ? ` ${dt(b.publishedAt)}` : ''}.</p>
          <a className="btn btn-secondary" href={d.path}>Открыть в каталоге</a>
        </section>
      )}
      {b.status === 'hidden' && <p className="card p-4 text-sm">Объявление снято с публикации. Чтобы вернуть его, напишите администратору ниже.</p>}

      {!awaiting && (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-base font-bold">Запросить изменения</h2>
          <p className="text-sm text-hint">Опишите, что поменять (цена, текст, фото, снять с продажи). Администратор внесёт изменения и сообщит в Telegram.</p>
          <textarea className="field min-h-24" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: снизить цену до ₪ 420 000" />
          <button className="btn btn-primary" onClick={sendRequest} disabled={busy || text.trim().length < 5}>Отправить запрос</button>
          {d.editRequests.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2 text-sm">
              {d.editRequests.map((r) => (
                <li key={r.id} className="rounded-card bg-bg p-2">
                  <p className="text-xs text-hint">{dt(r.createdAt)} · {r.status === 'new' ? 'ждёт ответа' : r.status === 'done' ? '✅ выполнено' : '❌ отклонено'}</p>
                  <p className="whitespace-pre-wrap">{r.text}</p>
                  {r.adminNote && <p className="text-hint">Ответ: {r.adminNote}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export type { BusinessDetail };
