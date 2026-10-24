import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { navigate, useMeta } from './App';
import MarkdownEditor from './MarkdownEditor';
import PhotoManager from './PhotoManager';
import SellerPanel from './SellerPanel';
import { ErrorBox, Field, NumberInput, Section, Spinner, STATUS_LABEL, STATUS_TONE, dt, useToast } from './ui';
import type { Business, BusinessDetail } from './types';
import { storageGet, storageSet, getWebApp } from '../scripts/tg';
import { formatPayback, paybackMonths, INCLUDED_LABELS, LEGAL_FORM_LABELS, LICENSE_LABELS } from '../lib/format';

/** Поля, которые редактирует форма (без служебных). */
const EDITABLE = [
  'publicTitle', 'categoryId', 'cityId', 'areaNote', 'priceIls', 'priceNegotiable', 'monthlyRevenueIls', 'monthlyProfitIls',
  'yearFounded', 'employeesCount', 'areaSqm', 'rentMonthlyIls', 'leaseUntil', 'legalForm', 'businessLicense', 'includedInSale',
  'ownerSupport', 'reasonForSale', 'shortDescription', 'description', 'videoUrl', 'isFeatured',
  'realName', 'exactAddress', 'ownerName', 'ownerPhone', 'ownerTelegram', 'internalNotes',
] as const;
type Form = Pick<Business, (typeof EDITABLE)[number]>;

const EMPTY: Form = {
  publicTitle: '', categoryId: null, cityId: null, areaNote: null, priceIls: null, priceNegotiable: false,
  monthlyRevenueIls: null, monthlyProfitIls: null, yearFounded: null, employeesCount: null, areaSqm: null,
  rentMonthlyIls: null, leaseUntil: null, legalForm: null, businessLicense: null, includedInSale: [],
  ownerSupport: null, reasonForSale: null, shortDescription: '', description: '', videoUrl: null, isFeatured: false,
  realName: null, exactAddress: null, ownerName: null, ownerPhone: null, ownerTelegram: null, internalNotes: null,
};

function pick(b: Business): Form {
  const f = { ...EMPTY };
  for (const k of EDITABLE) (f as Record<string, unknown>)[k] = b[k];
  return f;
}

/** Пустые строки → null, чтобы сервер не хранил мусор. */
function payload(f: Form) {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    const v = f[k];
    out[k] = typeof v === 'string' && v.trim() === '' && !['publicTitle', 'shortDescription', 'description'].includes(k) ? null : v;
  }
  return out;
}

const AUTOSAVE_MS = 10_000;
const localKey = (id: number) => `bm_admin_draft_${id}`;
const ACTION_LABEL: Record<string, string> = { create: 'создал', update: 'изменил', publish: 'опубликовал', hide: 'снял с публикации', duplicate: 'создал копией', delete: 'удалил' };

export default function ListingForm({ id: initialId }: { id: number | null }) {
  const { meta } = useMeta();
  const toast = useToast();
  const [id, setId] = useState<number | null>(initialId);
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(initialId !== null);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notify, setNotify] = useState(true);
  const [restore, setRestore] = useState<{ form: Form; savedAt: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const formRef = useRef(form);
  formRef.current = form;
  const creating = useRef<Promise<number | null> | null>(null);

  const applyDetail = useCallback((d: BusinessDetail, resetForm: boolean) => {
    setDetail(d);
    setMissing([]);
    if (resetForm) {
      setForm(pick(d.business));
      setDirty(false);
    }
  }, []);

  useEffect(() => {
    if (initialId === null) return;
    (async () => {
      try {
        const d = await api<BusinessDetail>(`businesses/${initialId}`);
        applyDetail(d, true);
        // Несохранённые изменения опубликованного лота (автосохранение в телефоне).
        const raw = storageGet(localKey(initialId));
        if (raw) {
          const saved = JSON.parse(raw) as { form: Form; savedAt: number; baseUpdatedAt: number };
          if (saved.baseUpdatedAt === d.business.updatedAt) setRestore(saved);
          else storageSet(localKey(initialId), '');
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [initialId, applyDetail]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  /** Создать черновик на сервере (для нового лота — при первом сохранении или фото). */
  const ensureId = useCallback(async (): Promise<number | null> => {
    if (id) return id;
    if (!creating.current) {
      creating.current = (async () => {
        try {
          const d = await api<BusinessDetail>('businesses', { body: payload(formRef.current) });
          setId(d.business.id);
          applyDetail(d, false);
          setDirty(false);
          setLastSaved(Date.now());
          history.replaceState(null, '', `#/listings/${d.business.id}`);
          return d.business.id;
        } catch (e) {
          toast((e as Error).message, 'error');
          creating.current = null;
          return null;
        }
      })();
    }
    return creating.current;
  }, [id, applyDetail, toast]);

  const save = useCallback(async (opts: { silent?: boolean; force?: boolean } = {}): Promise<BusinessDetail | null> => {
    if (!id) {
      const nid = await ensureId();
      return nid ? api<BusinessDetail>(`businesses/${nid}`) : null;
    }
    setSaving(true);
    try {
      const body = { ...payload(formRef.current), ...(opts.force ? {} : { expectedUpdatedAt: detail?.business.updatedAt }) };
      const d = await api<BusinessDetail>(`businesses/${id}`, { method: 'PUT', body });
      applyDetail(d, false);
      setDirty(false);
      setConflict(false);
      setLastSaved(Date.now());
      storageSet(localKey(id), '');
      if (!opts.silent) toast('Сохранено');
      return d;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      else if (!opts.silent) toast((e as Error).message, 'error');
      return null;
    } finally {
      setSaving(false);
    }
  }, [id, detail, ensureId, applyDetail, toast]);

  // Автосохранение каждые 10 секунд: черновик — на сервер, опубликованный — в память телефона.
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty || saving || conflict) return;
      const status = detail?.business.status ?? 'draft';
      if (status === 'draft') {
        const f = formRef.current;
        const hasContent = f.publicTitle || f.description || f.shortDescription || f.priceIls;
        if (id || hasContent) save({ silent: true });
      } else if (id && detail) {
        storageSet(localKey(id), JSON.stringify({ form: formRef.current, savedAt: Date.now(), baseUpdatedAt: detail.business.updatedAt }));
        setLastSaved(Date.now());
      }
    }, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [dirty, saving, conflict, detail, id, save]);

  async function reloadFromServer() {
    if (!id) return;
    const d = await api<BusinessDetail>(`businesses/${id}`);
    applyDetail(d, true);
    setConflict(false);
    storageSet(localKey(id), '');
  }

  async function publish() {
    const d = dirty || !id ? await save({ silent: true }) : detail;
    if (!d) return;
    try {
      const r = await api<BusinessDetail>(`businesses/${d.business.id}/publish`, { body: { notify } });
      applyDetail(r, true);
      (await getWebApp())?.HapticFeedback?.notificationOccurred('success');
      toast(r.notificationQueued ? 'Опубликовано. Подписчики получат уведомление' : 'Опубликовано');
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setMissing((e.data.missing as string[]) ?? []);
      toast((e as Error).message, 'error');
    }
  }

  async function hide() {
    if (!id) return;
    try {
      applyDetail(await api<BusinessDetail>(`businesses/${id}/hide`, { method: 'POST' }), true);
      toast('Снято с публикации');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  async function openPreview() {
    const d = dirty || !id ? await save({ silent: true }) : detail;
    if (d) location.href = d.previewUrl;
  }

  if (loading) return <Spinner />;
  if (error) return (
    <div className="flex flex-col gap-3">
      <a href="#/listings" className="text-sm">← Все объявления</a>
      <ErrorBox error={error} />
    </div>
  );

  const b = detail?.business;
  const status = b?.status ?? 'draft';
  const payback = paybackMonths(form.priceIls, form.monthlyProfitIls);
  const isMissing = (label: string) => missing.includes(label);
  const firstPublish = !b?.publishedAt;
  const str = (v: string | null) => v ?? '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <a href="#/listings" className="text-sm">← Все объявления</a>
          <h1 className="text-xl font-extrabold">{b ? `Лот №${b.lotNumber}` : 'Новое объявление'}</h1>
          <p className="text-xs text-hint">
            {b && <span className={`badge mr-2 ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>}
            {saving ? 'Сохранение…' : dirty ? 'Есть несохранённые изменения' : lastSaved ? `Сохранено ${dt(lastSaved)}` : ''}
          </p>
        </div>
      </div>

      {conflict && (
        <div className="card border-2 border-danger p-3" role="alert">
          <p className="font-semibold text-danger">Объявление изменено другим администратором</p>
          <p className="mt-1 text-sm">Обновите форму, чтобы увидеть его правки (ваши несохранённые изменения пропадут), или сохраните свою версию поверх.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={reloadFromServer}>Обновить форму</button>
            <button className="btn btn-secondary" onClick={() => save({ force: true })}>Сохранить поверх</button>
          </div>
        </div>
      )}

      {restore && (
        <div className="card bg-warn p-3">
          <p className="text-sm font-semibold">Есть несохранённые изменения от {dt(restore.savedAt)}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary" onClick={() => { setForm(restore.form); setDirty(true); setRestore(null); }}>Восстановить</button>
            <button className="btn btn-secondary" onClick={() => { if (id) storageSet(localKey(id), ''); setRestore(null); }}>Отбросить</button>
          </div>
        </div>
      )}

      {detail?.seller && <SellerPanel detail={detail} onDetail={(d) => applyDetail(d, !dirty)} />}

      <Section title="Основное">
        <Field label="Обезличенное название" htmlFor="f-title" hint={`${form.publicTitle.length}/80 · без реального названия и адреса`} error={isMissing('название') ? 'Обязательно' : undefined}>
          <input id="f-title" className="field" maxLength={80} value={form.publicTitle} onChange={(e) => set('publicTitle', e.target.value)} placeholder="Кофейня с террасой в центре Хайфы" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Город" htmlFor="f-city" error={isMissing('город') ? 'Обязательно' : undefined}>
            <select id="f-city" className="field" value={form.cityId ?? ''} onChange={(e) => set('cityId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— выберите —</option>
              {meta.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Отрасль" htmlFor="f-cat" error={isMissing('отрасль') ? 'Обязательно' : undefined}>
            <select id="f-cat" className="field" value={form.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">— выберите —</option>
              {meta.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Район (без адреса)" htmlFor="f-area" hint="Например: центр города, промзона">
          <input id="f-area" className="field" maxLength={120} value={str(form.areaNote)} onChange={(e) => set('areaNote', e.target.value)} />
        </Field>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={form.isFeatured} onChange={(e) => set('isFeatured', e.target.checked)} />
          <span>📌 Закрепить в начале списка</span>
        </label>
      </Section>

      <Section title="Цифры">
        <Field label="Цена продажи" htmlFor="f-price" error={isMissing('цена') ? 'Обязательно' : undefined}>
          <NumberInput id="f-price" value={form.priceIls} onChange={(v) => set('priceIls', v)} suffix="₪" placeholder="450 000" />
        </Field>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={form.priceNegotiable} onChange={(e) => set('priceNegotiable', e.target.checked)} />
          <span>Торг возможен</span>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Оборот в месяц" htmlFor="f-rev"><NumberInput id="f-rev" value={form.monthlyRevenueIls} onChange={(v) => set('monthlyRevenueIls', v)} suffix="₪" /></Field>
          <Field label="Чистая прибыль в месяц" htmlFor="f-profit" hint={payback ? `Окупаемость: ${formatPayback(payback)}` : 'Окупаемость посчитается автоматически'}>
            <NumberInput id="f-profit" value={form.monthlyProfitIls} onChange={(v) => set('monthlyProfitIls', v)} suffix="₪" />
          </Field>
          <Field label="Аренда в месяц" htmlFor="f-rent"><NumberInput id="f-rent" value={form.rentMonthlyIls} onChange={(v) => set('rentMonthlyIls', v)} suffix="₪" /></Field>
          <Field label="Договор аренды до" htmlFor="f-lease">
            <input id="f-lease" type="date" className="field" value={str(form.leaseUntil)} onChange={(e) => set('leaseUntil', e.target.value || null)} />
          </Field>
          <Field label="Год открытия" htmlFor="f-year"><NumberInput id="f-year" value={form.yearFounded} onChange={(v) => set('yearFounded', v && v > 2100 ? 2100 : v)} /></Field>
          <Field label="Сотрудников" htmlFor="f-emp"><NumberInput id="f-emp" value={form.employeesCount} onChange={(v) => set('employeesCount', v)} /></Field>
          <Field label="Площадь помещения" htmlFor="f-sqm"><NumberInput id="f-sqm" value={form.areaSqm} onChange={(v) => set('areaSqm', v)} suffix="м²" /></Field>
          <Field label="Форма собственности" htmlFor="f-legal">
            <select id="f-legal" className="field" value={form.legalForm ?? ''} onChange={(e) => set('legalForm', e.target.value || null)}>
              <option value="">—</option>
              {Object.entries(LEGAL_FORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Лицензия на бизнес" htmlFor="f-lic">
            <select id="f-lic" className="field" value={form.businessLicense ?? ''} onChange={(e) => set('businessLicense', e.target.value || null)}>
              <option value="">—</option>
              {Object.entries(LICENSE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Описание">
        <Field label="Краткое описание" htmlFor="f-short" hint={`${form.shortDescription.length}/200 · для списка, превью в Telegram и поисковиков`} error={isMissing('краткое описание') ? 'Обязательно' : undefined}>
          <textarea id="f-short" className="field min-h-20" maxLength={200} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
        </Field>
        <Field label="Полное описание" htmlFor="f-desc" error={isMissing('полное описание') ? 'Обязательно' : undefined}>
          <MarkdownEditor id="f-desc" value={form.description} onChange={(v) => set('description', v)} />
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
        <Field label="Передача дел" htmlFor="f-support" hint="Например: 2 недели обучения нового владельца">
          <input id="f-support" className="field" maxLength={300} value={str(form.ownerSupport)} onChange={(e) => set('ownerSupport', e.target.value)} />
        </Field>
        <Field label="Причина продажи" htmlFor="f-reason">
          <textarea id="f-reason" className="field min-h-20" maxLength={1000} value={str(form.reasonForSale)} onChange={(e) => set('reasonForSale', e.target.value)} />
        </Field>
      </Section>

      <Section title="Фото и видео">
        {isMissing('минимум 1 фото') && <p className="text-sm text-danger">Добавьте минимум 1 фото</p>}
        <PhotoManager photos={detail?.photos ?? []} ensureId={ensureId} onDetail={(d) => applyDetail(d, false)} />
        <Field label="Видео YouTube" htmlFor="f-video">
          <input id="f-video" className="field" inputMode="url" value={str(form.videoUrl)} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://youtu.be/…" />
        </Field>
      </Section>

      <Section title="Скрытые данные" tone="secret" hint="🔒 Не видно посетителям">
        <Field label="Реальное название" htmlFor="f-real"><input id="f-real" className="field" maxLength={200} value={str(form.realName)} onChange={(e) => set('realName', e.target.value)} /></Field>
        <Field label="Точный адрес" htmlFor="f-addr"><input id="f-addr" className="field" maxLength={300} value={str(form.exactAddress)} onChange={(e) => set('exactAddress', e.target.value)} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Владелец" htmlFor="f-oname"><input id="f-oname" className="field" maxLength={120} value={str(form.ownerName)} onChange={(e) => set('ownerName', e.target.value)} /></Field>
          <Field label="Телефон владельца" htmlFor="f-ophone"><input id="f-ophone" className="field" type="tel" maxLength={40} value={str(form.ownerPhone)} onChange={(e) => set('ownerPhone', e.target.value)} /></Field>
          <Field label="Telegram владельца" htmlFor="f-otg"><input id="f-otg" className="field" maxLength={64} value={str(form.ownerTelegram)} onChange={(e) => set('ownerTelegram', e.target.value)} placeholder="@username" /></Field>
        </div>
        <Field label="Заметки администраторов" htmlFor="f-notes" hint="Комиссия, договорённости">
          <textarea id="f-notes" className="field min-h-20" maxLength={5000} value={str(form.internalNotes)} onChange={(e) => set('internalNotes', e.target.value)} />
        </Field>
      </Section>

      {status !== 'published' && (
        <div className="card flex flex-col gap-3 p-4">
          {firstPublish && !b?.notifiedAt && (
            <label className="flex min-h-[44px] items-center gap-3">
              <input type="checkbox" className="h-5 w-5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <span>Уведомить подписчиков</span>
            </label>
          )}
          {!firstPublish && <p className="text-sm text-hint">Лот уже публиковался — повторной рассылки не будет.</p>}
          {detail?.missing && detail.missing.length > 0 && <p className="text-sm text-hint">Для публикации заполните: {detail.missing.join(', ')}</p>}
          <button className="btn btn-primary w-full" onClick={publish} disabled={saving}>Опубликовать</button>
        </div>
      )}

      {detail && detail.audit.length > 0 && (
        <Section title="Журнал изменений">
          <ul className="flex flex-col gap-1 text-sm">
            {detail.audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span>{a.adminName ?? a.adminId} {ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="shrink-0 text-hint">{dt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="h-16" aria-hidden="true" />
      {/* Панель действий над вкладками */}
      <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] gap-2 p-2.5">
          <button className="btn btn-primary flex-1" onClick={() => save()} disabled={saving || (!dirty && !!id)}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
          <button className="btn btn-secondary" onClick={openPreview} disabled={saving}>Предпросмотр</button>
          {status === 'published' && <button className="btn btn-secondary text-danger" onClick={hide}>Снять</button>}
          {status === 'published' && detail && <a className="btn btn-secondary" href={detail.path}>Открыть</a>}
        </div>
      </div>
    </div>
  );
}

export { navigate };
