import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { navigate } from './App';
import { ErrorBox, Segmented, Spinner, STATUS_LABEL, STATUS_TONE, confirmDialog, fmtNum, useToast } from './ui';
import type { BusinessDetail, ListingRow } from './types';

type Filter = 'all' | 'published' | 'draft' | 'hidden';

export default function Listings() {
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<ListingRow[] | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<number | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setError('');
      const r = await api<{ items: ListingRow[] }>(`businesses${filter === 'all' ? '' : `?status=${filter}`}`);
      setItems(r.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [filter]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  async function act(row: ListingRow, action: 'publish' | 'hide' | 'duplicate' | 'delete') {
    setMenu(null);
    const confirm = confirmDialog;
    try {
      if (action === 'publish') {
        const r = await api<BusinessDetail>(`businesses/${row.id}/publish`, { body: { notify: true } });
        toast(r.notificationQueued ? 'Опубликовано, подписчики получат уведомление' : 'Опубликовано');
      } else if (action === 'hide') {
        if (!(await confirm(`Снять лот №${row.lotNumber} с публикации?`))) return;
        await api(`businesses/${row.id}/hide`, { method: 'POST' });
        toast('Лот снят с публикации');
      } else if (action === 'duplicate') {
        const r = await api<BusinessDetail>(`businesses/${row.id}/duplicate`, { method: 'POST' });
        toast(`Создан черновик №${r.business.lotNumber}`);
        navigate(`#/listings/${r.business.id}`);
        return;
      } else if (action === 'delete') {
        if (!(await confirm(`Удалить черновик №${row.lotNumber}?`))) return;
        await api(`businesses/${row.id}`, { method: 'DELETE' });
        toast('Черновик удалён');
      }
      load();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Объявления</h1>
        <a href="#/listings/new" className="btn btn-primary">+ Новое объявление</a>
      </div>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[['all', 'Все'], ['published', 'Опубликованные'], ['draft', 'Черновики'], ['hidden', 'Скрытые']]}
      />
      {error && <ErrorBox error={error} onRetry={load} />}
      {!items && !error && <Spinner />}
      {items && items.length === 0 && <p className="card p-6 text-center text-hint">Здесь пока пусто</p>}
      <ul className="flex flex-col gap-2">
        {items?.map((r) => (
          <li key={r.id} className="card relative flex gap-3 p-2.5">
            <a href={`#/listings/${r.id}`} className="flex min-w-0 flex-1 gap-3 text-text no-underline">
              <div className="h-[72px] w-24 shrink-0 overflow-hidden rounded-lg bg-line">
                {r.cover && <img src={r.cover} alt="" className="h-full w-full object-cover" loading="lazy" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-hint">
                  №{r.lotNumber} · {r.cityName ?? 'город не указан'} {r.isFeatured && '· 📌'}
                </p>
                <p className="truncate font-semibold">{r.publicTitle || 'Без названия'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`badge ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  {r.priceIls ? <span>₪ {fmtNum(r.priceIls)}</span> : null}
                  <span className="text-hint">👁 {r.views30} · ✉️ {r.leads30} за 30 дн.</span>
                </div>
              </div>
            </a>
            <button type="button" className="h-11 w-11 shrink-0 rounded-full text-xl text-hint" aria-label="Действия" onClick={() => setMenu(menu === r.id ? null : r.id)}>⋯</button>
            {menu === r.id && (
              <div className="absolute right-2 top-14 z-20 flex w-56 flex-col overflow-hidden rounded-card bg-card shadow-card ring-1 ring-line">
                <a className="px-4 py-3 text-text no-underline" href={`#/listings/${r.id}`}>Редактировать</a>
                {r.status !== 'published' && <button className="px-4 py-3 text-left" onClick={() => act(r, 'publish')}>Опубликовать</button>}
                {r.status === 'published' && <button className="px-4 py-3 text-left" onClick={() => act(r, 'hide')}>Снять с публикации</button>}
                <button className="px-4 py-3 text-left" onClick={() => act(r, 'duplicate')}>Дублировать</button>
                {r.status === 'published' && <a className="px-4 py-3 text-text no-underline" href={r.path}>Открыть как посетитель</a>}
                {r.status === 'draft' && <button className="px-4 py-3 text-left text-danger" onClick={() => act(r, 'delete')}>Удалить черновик</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
