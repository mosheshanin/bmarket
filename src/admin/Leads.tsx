import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useMeta } from './App';
import { ErrorBox, Segmented, Spinner, dt, useToast } from './ui';
import type { LeadRow, ListingRow } from './types';
import { getWebApp } from '../scripts/tg';
import { israelDateIso, prettyPhone, LEAD_STATUS_LABELS, CONTACT_LABELS } from '../lib/format';

type F = 'all' | 'new' | 'in_progress' | 'closed_won' | 'closed_lost';
const TONE: Record<string, string> = {
  new: 'bg-accent/15 text-accent', in_progress: 'bg-warn text-text', closed_won: 'bg-success/15 text-success', closed_lost: 'bg-hint/15 text-hint',
};

export default function Leads() {
  const { reloadMeta } = useMeta();
  const [status, setStatus] = useState<F>('all');
  const [lot, setLot] = useState('');
  const [items, setItems] = useState<LeadRow[] | null>(null);
  const [summary, setSummary] = useState({ unread: 0, new: 0, undelivered: 0 });
  const [lots, setLots] = useState<ListingRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const q = new URLSearchParams();
      if (status !== 'all') q.set('status', status);
      if (lot) q.set('businessId', lot);
      const r = await api<{ items: LeadRow[]; summary: typeof summary }>(`leads?${q}`);
      setItems(r.items);
      setSummary(r.summary);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, lot]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api<{ items: ListingRow[] }>('businesses').then((r) => setLots(r.items)).catch(() => {});
    reloadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-extrabold">Заявки</h1>
      {summary.undelivered > 0 && (
        <p className="rounded-card bg-danger/10 p-3 text-sm text-danger">⚠️ {summary.undelivered} заявок не доставлено в Telegram — они вверху списка.</p>
      )}
      <Segmented<F>
        value={status}
        onChange={setStatus}
        options={[['all', 'Все'], ['new', 'Новые', summary.new], ['in_progress', 'В работе'], ['closed_won', 'Сделка'], ['closed_lost', 'Отказ']]}
      />
      <select className="field" value={lot} onChange={(e) => setLot(e.target.value)} aria-label="Фильтр по лоту">
        <option value="">Все лоты</option>
        {lots.map((l) => <option key={l.id} value={l.id}>№{l.lotNumber} — {l.publicTitle}</option>)}
      </select>

      {error && <ErrorBox error={error} onRetry={load} />}
      {!items && !error && <Spinner />}
      {items?.length === 0 && <p className="card p-6 text-center text-hint">Заявок пока нет</p>}
      <ul className="flex flex-col gap-2">
        {items?.map((l) => (
          <li key={l.id}>
            <a href={`#/leads/${l.id}`} className={`card flex flex-col gap-1 p-3 text-text no-underline ${!l.isRead ? 'ring-2 ring-accent' : ''}`}>
              <div className="flex items-center justify-between gap-2 text-xs text-hint">
                <span>{!l.isRead && <span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent" />}№{l.id} · {dt(l.createdAt)}</span>
                <span className={`badge ${TONE[l.status]}`}>{LEAD_STATUS_LABELS[l.status]}</span>
              </div>
              <p className={!l.isRead ? 'font-bold' : 'font-semibold'}>{l.name ?? '— (данные удалены)'} {l.phone && <span className="font-normal text-hint">· {prettyPhone(l.phone)}</span>}</p>
              <p className="truncate text-sm">Лот №{l.lotNumber} — {l.publicTitle}</p>
              <p className="text-xs text-hint">
                {CONTACT_LABELS[l.preferredContact]} · {l.source === 'mini_app' ? 'мини-приложение' : 'сайт'}
                {l.handledByName && ` · ${l.handledByName}`}
                {l.tgDelivered === false && <span className="ml-1 text-danger">· не доставлена в Telegram</span>}
              </p>
            </a>
          </li>
        ))}
      </ul>
      <ExportBlock />
    </div>
  );
}

function ExportBlock() {
  const toast = useToast();
  const [from, setFrom] = useState(israelDateIso(Date.now() - 30 * 86_400_000));
  const [to, setTo] = useState(israelDateIso());
  const q = `from=${from}&to=${to}`;

  async function download() {
    try {
      const r = await api<{ url: string; filename: string }>(`leads/export-link?${q}`, { method: 'POST' });
      const url = location.origin + r.url;
      const wa = await getWebApp();
      if (wa?.downloadFile && wa.isVersionAtLeast('8.0')) wa.downloadFile({ url, file_name: r.filename });
      else location.href = url;
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function sendToChat() {
    try {
      await api(`leads/export-send?${q}`, { method: 'POST' });
      toast('Файл отправлен вам в чат с ботом');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  return (
    <section className="card mt-2 p-4">
      <h2 className="mb-2 font-bold">Выгрузка в CSV</h2>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">С<input type="date" className="field mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">По<input type="date" className="field mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={download}>Скачать CSV</button>
        <button className="btn btn-secondary" onClick={sendToChat}>Прислать в чат с ботом</button>
      </div>
    </section>
  );
}
