import { useEffect, useState } from 'react';
import { api } from './api';
import { useMeta } from './App';
import { ErrorBox, Section, Spinner, dt, useToast } from './ui';
import { getWebApp } from '../scripts/tg';
import { CONTACT_LABELS, LEAD_STATUS_LABELS, formatIls, prettyPhone } from '../lib/format';

interface Detail {
  lead: {
    id: number; createdAt: number; name: string | null; phone: string | null; preferredContact: string; comment: string | null;
    telegramUserId: number | null; telegramUsername: string | null; source: string; utmSource: string | null; utmMedium: string | null;
    utmCampaign: string | null; status: keyof typeof LEAD_STATUS_LABELS; adminNote: string | null; handledByName: string | null;
    tgDelivered: boolean | null; consentAt: number; anonymizedAt: number | null;
  };
  business: {
    id: number; lotNumber: number; publicTitle: string; priceIls: number | null; path: string; status: string;
    realName: string | null; exactAddress: string | null; ownerName: string | null; ownerPhone: string | null;
    ownerTelegram: string | null; internalNotes: string | null;
  } | null;
  /** Ответы опроса этого посетителя (что ищет), если он их давал. */
  buyerRequest?: string | null;
}

const STATUSES = ['new', 'in_progress', 'closed_won', 'closed_lost'] as const;

function tgLink(username: string | null, id: number | null) {
  if (username) return `https://t.me/${username.replace(/^@/, '')}`;
  if (id) return `tg://user?id=${id}`;
  return null;
}

export default function LeadView({ id }: { id: number }) {
  const { reloadMeta } = useMeta();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Detail>(`leads/${id}`)
      .then((r) => {
        setD(r);
        setNote(r.lead.adminNote ?? '');
        reloadMeta();
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      const r = await api<Detail>(`leads/${id}`, { method: 'PATCH', body });
      setD(r);
      toast(msg);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      setD(await api<Detail>(`leads/${id}/resend`, { method: 'POST' }));
      toast('Отправлено в группу менеджеров');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function openTg(url: string) {
    const wa = await getWebApp();
    if (wa && url.startsWith('https://t.me/')) wa.openTelegramLink(url);
    else location.href = url;
  }

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Spinner />;
  const { lead, business: b } = d;
  const phoneDigits = lead.phone?.replace(/\D/g, '');
  const leadTg = tgLink(lead.telegramUsername, lead.telegramUserId);
  const ownerTg = b?.ownerTelegram ? tgLink(b.ownerTelegram, null) : null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <a href="#/leads" className="text-sm">← Все заявки</a>
        <h1 className="text-xl font-extrabold">Заявка №{lead.id}</h1>
        <p className="text-sm text-hint">{dt(lead.createdAt)} · {lead.source === 'mini_app' ? 'мини-приложение' : 'сайт'}</p>
      </div>

      {lead.tgDelivered === false && (
        <div className="card flex items-center justify-between gap-2 border-2 border-danger p-3">
          <span className="text-sm text-danger">Не доставлена в Telegram</span>
          <button className="btn btn-secondary" onClick={resend} disabled={busy}>Отправить ещё раз</button>
        </div>
      )}

      <Section title="Покупатель">
        {lead.anonymizedAt && <p className="text-sm text-hint">Личные данные удалены {dt(lead.anonymizedAt)} (срок хранения 24 месяца).</p>}
        <p className="text-lg font-bold">{lead.name ?? '—'}</p>
        {lead.phone && <p>{prettyPhone(lead.phone)}</p>}
        <p className="text-sm">Предпочитает: <b>{CONTACT_LABELS[lead.preferredContact]}</b></p>
        {lead.telegramUsername && <p className="text-sm">Telegram: @{lead.telegramUsername}</p>}
        {lead.comment && <p className="whitespace-pre-line rounded-lg bg-bg p-3 text-sm">{lead.comment}</p>}
        {d.buyerRequest && <p className="whitespace-pre-line rounded-lg bg-accent/10 p-3 text-sm">🎯 Из опроса. {d.buyerRequest}</p>}
        {(lead.utmSource || lead.utmCampaign) && <p className="text-xs text-hint">UTM: {[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ')}</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {lead.phone && <a className="btn btn-primary" href={`tel:${lead.phone}`}>Позвонить</a>}
          {phoneDigits && <button className="btn btn-secondary" onClick={() => openTg(`https://wa.me/${phoneDigits}`)}>Написать в WhatsApp</button>}
          {leadTg && <button className="btn btn-secondary" onClick={() => openTg(leadTg)}>Написать в Telegram</button>}
        </div>
      </Section>

      <Section title="Статус">
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button key={s} className="chip justify-center !text-sm" aria-current={lead.status === s ? 'page' : undefined} disabled={busy}
              onClick={() => lead.status !== s && patch({ status: s }, `Статус: ${LEAD_STATUS_LABELS[s]}`)}>
              {LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {lead.handledByName && <p className="text-sm text-hint">Взял: {lead.handledByName}</p>}
        <label className="label" htmlFor="lead-note">Заметка менеджера</label>
        <textarea id="lead-note" className="field min-h-20" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-secondary self-start" disabled={busy || note === (lead.adminNote ?? '')} onClick={() => patch({ adminNote: note }, 'Заметка сохранена')}>Сохранить заметку</button>
      </Section>

      {b && (
        <Section title={`Лот №${b.lotNumber}`}>
          <a href={`#/listings/${b.id}`} className="font-semibold">{b.publicTitle}</a>
          {b.priceIls && <p>{formatIls(b.priceIls)}</p>}
          {b.status === 'published' && <a href={b.path} className="text-sm">Открыть как посетитель →</a>}
        </Section>
      )}

      {b && (
        <Section title="Скрытые данные лота" tone="secret" hint="🔒 Не видно посетителям">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-hint">Название</dt><dd>{b.realName || '—'}</dd>
            <dt className="text-hint">Адрес</dt><dd>{b.exactAddress || '—'}</dd>
            <dt className="text-hint">Владелец</dt><dd>{b.ownerName || '—'}</dd>
            <dt className="text-hint">Телефон</dt><dd>{b.ownerPhone ? <a href={`tel:${b.ownerPhone.replace(/[^\d+]/g, '')}`}>{b.ownerPhone}</a> : '—'}</dd>
            <dt className="text-hint">Telegram</dt><dd>{ownerTg ? <button className="underline" onClick={() => openTg(ownerTg)}>{b.ownerTelegram}</button> : '—'}</dd>
          </dl>
          {b.internalNotes && <p className="whitespace-pre-line rounded-lg bg-bg p-3 text-sm">{b.internalNotes}</p>}
        </Section>
      )}
      <p className="text-xs text-hint">Согласие с политикой: {dt(lead.consentAt)}</p>
    </div>
  );
}
