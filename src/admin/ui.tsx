import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { getWebApp } from '../scripts/tg';

/** Подтверждение: в Telegram — системное окно, иначе window.confirm. */
export async function confirmDialog(text: string): Promise<boolean> {
  const wa = await getWebApp();
  if (wa) return new Promise((res) => wa.showConfirm(text, (ok) => res(!!ok)));
  return window.confirm(text);
}

export function Spinner({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-hint" role="status">
      <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="card p-4 text-danger" role="alert">
      <p>{error}</p>
      {onRetry && <button className="btn btn-secondary mt-2" onClick={onRetry}>Повторить</button>}
    </div>
  );
}

export function Section({ title, children, tone, hint }: { title: string; children: ReactNode; tone?: 'secret'; hint?: string }) {
  return (
    <section className={`card p-4 ${tone === 'secret' ? 'border-2 border-dashed border-danger/50 bg-danger/5' : ''}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {hint && <span className={`text-xs font-semibold ${tone === 'secret' ? 'text-danger' : 'text-hint'}`}>{hint}</span>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function Field({ label, children, hint, error, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; error?: string; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-hint">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

const NBSP = ' ';
export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP));

/** Числовое поле с форматированием при вводе: «450 000». */
export function NumberInput({ value, onChange, id, placeholder, suffix }: { value: number | null | undefined; onChange: (v: number | null) => void; id?: string; placeholder?: string; suffix?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        className="field pr-10"
        inputMode="numeric"
        placeholder={placeholder}
        value={fmtNum(value)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
          onChange(digits ? Number(digits) : null);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-hint">{suffix}</span>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string, number?][]; onChange: (v: T) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
      {options.map(([v, label, badge]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className="chip !min-h-[40px] !text-sm" aria-current={value === v ? 'page' : undefined}>
          {label}
          {badge ? <span className="ml-1.5 rounded-full bg-danger px-1.5 text-xs text-white">{badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

type Toast = { id: number; text: string; tone: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 2500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto max-w-md rounded-card px-4 py-2.5 text-sm font-semibold shadow-card ${t.tone === 'error' ? 'bg-danger text-white' : 'bg-text text-card'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const STATUS_LABEL: Record<string, string> = { draft: 'Черновик', published: 'Опубликован', hidden: 'Снят' };
export const STATUS_TONE: Record<string, string> = {
  draft: 'bg-hint/15 text-hint',
  published: 'bg-success/15 text-success',
  hidden: 'bg-danger/15 text-danger',
};

export function dt(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts);
}
