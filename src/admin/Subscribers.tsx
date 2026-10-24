import { useEffect, useState } from 'react';
import { api } from './api';
import { ErrorBox, Section, Spinner, dt } from './ui';

interface Data {
  active: number;
  growth7: number;
  growth30: number;
  broadcasts: { id: number; status: string; lots: number[]; scheduledAt: number; startedAt: number | null; finishedAt: number | null; delivered: number; blocked: number; failed: number }[];
}

const ST: Record<string, string> = { pending: 'Запланирована', sending: 'Идёт отправка', done: 'Завершена' };

export default function Subscribers() {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Data>('subscribers').then(setD).catch((e) => setError(e.message));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-extrabold">Подписчики</h1>
      <div className="grid grid-cols-3 gap-2">
        {[['Активных', d.active], ['За 7 дней', `+${d.growth7}`], ['За 30 дней', `+${d.growth30}`]].map(([l, v]) => (
          <div key={l} className="card p-3 text-center">
            <p className="text-2xl font-extrabold">{v}</p>
            <p className="text-xs text-hint">{l}</p>
          </div>
        ))}
      </div>
      <Section title="История рассылок">
        {d.broadcasts.length === 0 && <p className="text-sm text-hint">Рассылок ещё не было</p>}
        <ul className="divide-y divide-line">
          {d.broadcasts.map((b) => (
            <li key={b.id} className="py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">Лоты: {b.lots.map((l) => `№${l}`).join(', ') || '—'}</span>
                <span className="text-hint">{ST[b.status]}</span>
              </div>
              <p className="text-hint">
                {b.status === 'pending' ? `Отправка ${dt(b.scheduledAt)}` : `Начата ${dt(b.startedAt)}`}
                {' · '}доставлено {b.delivered}, заблокировали бота {b.blocked}{b.failed ? `, ошибок ${b.failed}` : ''}
              </p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-hint">Не чаще 1 рассылки в 2 часа: лоты, опубликованные за это время, уходят одной подборкой. Отправка — порциями по 40 сообщений в минуту.</p>
      </Section>
    </div>
  );
}
