import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { ErrorBox, Section, Segmented, Spinner, dt, useToast } from './ui';
import { prettyPhone } from '../lib/format';

type P = '7' | '30' | '90' | 'all';
interface LotStat { lot?: number; title?: string; path?: string; n: number }
interface Data {
  opens: { total: number; miniApp: number; web: number };
  views: number;
  formOpens: number;
  leads: number;
  conversion: number;
  subscribers: { active: number; new: number; left: number };
  topByViews: LotStat[];
  topByLeads: LotStat[];
  cities: { city: string; views: number; leads: number }[];
  leadSources: { source: string; utm: string | null; n: number }[];
  daily: { date: string; views: number; leads: number }[];
}

/** График по дням: просмотры (столбцы) и заявки (линия) на одной оси времени. */
function DailyChart({ data }: { data: Data['daily'] }) {
  const W = 640;
  const H = 180;
  const pad = { l: 28, r: 28, t: 10, b: 22 };
  const maxV = Math.max(1, ...data.map((d) => d.views));
  const maxL = Math.max(1, ...data.map((d) => d.leads));
  const n = Math.max(1, data.length);
  const bw = (W - pad.l - pad.r) / n;
  const y = (v: number, max: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${pad.l + bw * (i + 0.5)},${y(d.leads, maxL)}`).join(' ');
  const labels = useMemo(() => {
    const step = Math.ceil(n / 6);
    return data.map((d, i) => (i % step === 0 ? { i, t: d.date.slice(8, 10) + '.' + d.date.slice(5, 7) } : null)).filter(Boolean) as { i: number; t: string }[];
  }, [data, n]);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Просмотры карточек и заявки по дням">
        {data.map((d, i) => (
          <rect key={d.date} x={pad.l + bw * i + bw * 0.15} width={bw * 0.7} y={y(d.views, maxV)} height={H - pad.b - y(d.views, maxV)} rx={2} fill="var(--accent)" opacity={0.35}>
            <title>{`${d.date}: просмотров ${d.views}, заявок ${d.leads}`}</title>
          </rect>
        ))}
        <path d={line} fill="none" stroke="var(--success)" strokeWidth={2} />
        <text x={2} y={pad.t + 8} fontSize="10" fill="var(--hint)">{maxV}</text>
        <text x={W - 2} y={pad.t + 8} fontSize="10" fill="var(--success)" textAnchor="end">{maxL}</text>
        {labels.map((l) => (
          <text key={l.i} x={pad.l + bw * (l.i + 0.5)} y={H - 6} fontSize="10" fill="var(--hint)" textAnchor="middle">{l.t}</text>
        ))}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-xs text-hint">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-accent opacity-40" />Просмотры карточек (левая шкала)</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-success align-middle" />Заявки (правая шкала)</span>
      </figcaption>
    </figure>
  );
}

function Top({ title, rows, unit }: { title: string; rows: LotStat[]; unit: string }) {
  return (
    <Section title={title}>
      {rows.length === 0 && <p className="text-sm text-hint">Нет данных</p>}
      <ol className="flex flex-col gap-1 text-sm">
        {rows.map((r, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{i + 1}. №{r.lot} {r.title}</span>
            <span className="shrink-0 font-semibold">{r.n} {unit}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export default function Stats() {
  const [period, setPeriod] = useState<P>('30');
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setD(null);
    api<Data>(`stats?period=${period}`).then(setD).catch((e) => setError(e.message));
  }, [period]);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-extrabold">Статистика</h1>
      <Segmented<P> value={period} onChange={setPeriod} options={[['7', '7 дней'], ['30', '30 дней'], ['90', '90 дней'], ['all', 'Всё время']]} />
      {error && <ErrorBox error={error} />}
      {!d && !error && <Spinner />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ['Открытия каталога', d.opens.total, `Telegram ${d.opens.miniApp} · сайт ${d.opens.web}`],
              ['Просмотры карточек', d.views, `Открытий формы: ${d.formOpens}`],
              ['Заявки', d.leads, `Конверсия ${String(d.conversion).replace('.', ',')}%`],
              ['Подписчики', d.subscribers.active, `+${d.subscribers.new} / −${d.subscribers.left}`],
            ].map(([l, v, s]) => (
              <div key={l as string} className="card p-3">
                <p className="text-xs text-hint">{l}</p>
                <p className="text-2xl font-extrabold">{v}</p>
                <p className="text-xs text-hint">{s}</p>
              </div>
            ))}
          </div>
          <Section title="По дням">
            <DailyChart data={d.daily} />
          </Section>
          <Top title="Топ-10 по просмотрам" rows={d.topByViews} unit="👁" />
          <Top title="Топ-10 по заявкам" rows={d.topByLeads} unit="✉️" />
          <Section title="Города">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-hint"><th className="font-normal">Город</th><th className="text-right font-normal">Просмотры</th><th className="text-right font-normal">Заявки</th></tr></thead>
              <tbody>
                {d.cities.map((c) => (
                  <tr key={c.city} className="border-t border-line"><td className="py-1">{c.city}</td><td className="text-right">{c.views}</td><td className="text-right">{c.leads}</td></tr>
                ))}
              </tbody>
            </table>
          </Section>
          <SurveyStats />
          <Section title="Источники заявок">
            <ul className="text-sm">
              {d.leadSources.map((s, i) => (
                <li key={i} className="flex justify-between border-t border-line py-1 first:border-0"><span>{s.source}{s.utm ? ` · ${s.utm}` : ''}</span><b>{s.n}</b></li>
              ))}
              {d.leadSources.length === 0 && <li className="text-hint">Нет заявок за период</li>}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

interface SurveyData {
  enabled: boolean;
  completed: { buy: number; sell: number; browse: number };
  skipped: number;
  budgets: { label: string; n: number }[];
  timelines: { label: string; n: number }[];
  topCategories: { name: string; buy: number; sell: number }[];
  consults: { userId: number; username: string | null; firstName: string | null; phone: string | null; intent: string | null; at: number; summary: string; comment: string | null }[];
}

/** Опрос при первом запуске: включение, предпросмотр, ответы и запросы на консультацию. */
function SurveyStats() {
  const toast = useToast();
  const [s, setS] = useState<SurveyData | null>(null);
  useEffect(() => {
    api<SurveyData>('survey').then(setS).catch(() => {});
  }, []);
  if (!s) return null;
  async function toggle(enabled: boolean) {
    try {
      setS(await api<SurveyData>('survey', { method: 'PUT', body: { enabled } }));
      toast(enabled ? 'Опрос включён для новых пользователей' : 'Опрос выключен');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  const total = s.completed.buy + s.completed.sell + s.completed.browse;
  const bar = (n: number, max: number) => (
    <span className="ml-2 inline-block h-2 rounded-full bg-accent/60 align-middle" style={{ width: `${max ? Math.max(4, (n / max) * 120) : 0}px` }} />
  );
  const maxB = Math.max(1, ...s.budgets.map((b) => b.n));
  return (
    <Section title="Опрос при первом запуске">
      <label className="flex min-h-[44px] items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={s.enabled} onChange={(e) => toggle(e.target.checked)} />
        <span>Показывать новым пользователям мини-приложения</span>
      </label>
      <a className="btn btn-secondary self-start" href="/?survey=1">Пройти опрос самому (предпросмотр)</a>
      <p className="text-sm">
        Ответили: <b>{total}</b> · купить {s.completed.buy} · продать {s.completed.sell} · смотрят {s.completed.browse} · пропустили {s.skipped}
      </p>
      {s.completed.buy > 0 && (
        <div className="text-sm">
          <p className="font-semibold">Бюджет покупателей</p>
          <ul>{s.budgets.map((b) => <li key={b.label} className="flex items-center justify-between gap-2 py-0.5"><span>{b.label}</span><span>{b.n}{bar(b.n, maxB)}</span></li>)}</ul>
        </div>
      )}
      {s.topCategories.length > 0 && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-hint"><th className="font-normal">Сфера</th><th className="text-right font-normal">Купить</th><th className="text-right font-normal">Продать</th></tr></thead>
          <tbody>{s.topCategories.map((c) => <tr key={c.name} className="border-t border-line"><td className="py-1">{c.name}</td><td className="text-right">{c.buy}</td><td className="text-right">{c.sell}</td></tr>)}</tbody>
        </table>
      )}
      {s.consults.length > 0 && (
        <div className="text-sm">
          <p className="font-semibold">Просили связаться</p>
          <ul className="flex flex-col gap-2">
            {s.consults.map((c) => (
              <li key={c.userId} className="rounded-lg bg-bg p-2">
                <p className="text-xs text-hint">{dt(c.at)} · {c.intent === 'sell' ? 'продаёт' : 'покупает'}</p>
                <p>
                  <a href={c.username ? `https://t.me/${c.username}` : `tg://user?id=${c.userId}`}>{c.username ? `@${c.username}` : c.firstName ?? 'Профиль'}</a>
                  {c.phone && <> · <a href={`tel:${c.phone}`}>{prettyPhone(c.phone)}</a></>}
                </p>
                <p className="text-hint">{c.summary}</p>
                {c.comment && <p className="whitespace-pre-line">{c.comment}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
