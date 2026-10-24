import { useState } from 'react';
import { api } from './api';
import { useMeta } from './App';
import { PAYMENT_STATUS_LABEL, SELLER_STAGE_LABEL, SELLER_STAGE_TONE, Section, confirmDialog, dt, fmtNum, useToast } from './ui';
import type { BusinessDetail, SellerInfo } from './types';

/** Блок в карточке лота, поданного продавцом: оплата, возврат на доработку, запросы на изменение. */
export default function SellerPanel({ detail, onDetail }: { detail: BusinessDetail; onDetail: (d: BusinessDetail) => void }) {
  const toast = useToast();
  const { reloadMeta } = useMeta();
  const s = detail.seller as SellerInfo;
  const b = detail.business;
  const [comment, setComment] = useState('');
  const [returning, setReturning] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<BusinessDetail>, ok: string) {
    setBusy(true);
    try {
      onDetail(await fn());
      toast(ok);
      reloadMeta();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const markPaid = async () => {
    if (!(await confirmDialog('Отметить размещение оплаченным (оплата получена вне PayPal)?'))) return;
    run(() => api<BusinessDetail>(`businesses/${b.id}/mark-paid`, { body: {} }), 'Оплата отмечена');
  };
  const sendBack = () =>
    run(() => api<BusinessDetail>(`businesses/${b.id}/return-to-seller`, { body: { comment } }), 'Возвращено продавцу — он получит сообщение').then(() => {
      setReturning(false);
      setComment('');
    });
  const resolve = (id: number, status: 'done' | 'rejected') =>
    run(() => api<BusinessDetail>(`edit-requests/${id}`, { method: 'PATCH', body: { status, adminNote: notes[id] || null } }), status === 'done' ? 'Продавец получит сообщение, что изменения внесены' : 'Запрос отклонён');

  const open = s.editRequests.filter((r) => r.status === 'new');
  const closed = s.editRequests.filter((r) => r.status !== 'new');

  return (
    <Section title="Объявление от продавца" hint={s.paid ? '💳 оплачено' : 'не оплачено'}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {s.stage && <span className={`badge ${SELLER_STAGE_TONE[s.stage]}`}>{SELLER_STAGE_LABEL[s.stage]}</span>}
        <a href={`tg://user?id=${s.tgId}`}>Написать продавцу в Telegram</a>
        {b.ownerTelegram && <span className="text-hint">{b.ownerTelegram}</span>}
      </div>
      {s.stage === 'in_review' && b.status === 'draft' && (
        <p className="rounded-card bg-accent/10 p-3 text-sm">Оплачено и ждёт вашей проверки. Отредактируйте при необходимости и нажмите «Опубликовать» — продавец получит сообщение.</p>
      )}

      {s.payments.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {s.payments.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>
                {p.provider === 'paypal' ? 'PayPal' : 'Вручную'} · ₪ {fmtNum(p.amount / 100)} · <b>{PAYMENT_STATUS_LABEL[p.status]}</b>
                {p.note && <span className="text-hint"> · {p.note}</span>}
              </span>
              <span className="shrink-0 text-hint">{dt(p.completedAt ?? p.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {!s.paid && <button className="btn btn-secondary" disabled={busy} onClick={markPaid}>Отметить оплату вручную</button>}
        {b.status === 'draft' && s.stage !== 'editing' && !returning && (
          <button className="btn btn-secondary" disabled={busy} onClick={() => setReturning(true)}>Вернуть на доработку</button>
        )}
      </div>
      {returning && (
        <div className="flex flex-col gap-2">
          <textarea className="field min-h-20" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что исправить — продавец увидит этот текст" />
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy || comment.trim().length < 3} onClick={sendBack}>Отправить продавцу</button>
            <button className="btn btn-secondary" onClick={() => setReturning(false)}>Отмена</button>
          </div>
        </div>
      )}

      {open.length > 0 && <h3 className="mt-1 font-bold">Запросы на изменение</h3>}
      {open.map((r) => (
        <div key={r.id} className="rounded-card border-2 border-accent/40 p-3 text-sm">
          <p className="text-xs text-hint">№{r.id} · {dt(r.createdAt)}</p>
          <p className="mt-1 whitespace-pre-wrap">{r.text}</p>
          <input className="field mt-2" maxLength={1000} placeholder="Ответ продавцу (необязательно)" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={() => resolve(r.id, 'done')}>Изменения внесены</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => resolve(r.id, 'rejected')}>Отклонить</button>
          </div>
        </div>
      ))}
      {open.length > 0 && <p className="text-xs text-hint">Сначала измените объявление в форме ниже и сохраните, затем отметьте запрос выполненным.</p>}
      {closed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-hint">Обработанные запросы · {closed.length}</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((r) => (
              <li key={r.id} className="rounded-card bg-bg p-2">
                <p className="text-xs text-hint">{r.status === 'done' ? '✅ выполнен' : '❌ отклонён'} · {r.handledByName} · {dt(r.handledAt)}</p>
                <p className="whitespace-pre-wrap">{r.text}</p>
                {r.adminNote && <p className="text-hint">Ответ: {r.adminNote}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}
