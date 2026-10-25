import { useEffect, useState, type MouseEvent } from 'react';
import { getWebApp } from '../scripts/tg';

/**
 * Нижнее меню админ-панели: 4 крупные вкладки (иконка + подпись, зона нажатия 64 px)
 * и «Ещё» — лист с редкими разделами. Активная вкладка — цветная «пилюля» за иконкой.
 * Повторное нажатие на активную вкладку — прокрутка наверх.
 */
const I = {
  listings: 'M3 9l1.6-5h14.8L21 9M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Zm0 0c0 1.7 1.3 3 3 3s3-1.3 3-3m0 0c0 1.7 1.3 3 3 3s3-1.3 3-3m0 0c0 1.7 1.3 3 3 3s3-1.3 3-3',
  leads: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z',
  stats: 'M3 3v18h18M8 17v-5M13 17V8M18 17v-9',
  more: 'M4 6h16M4 12h16M4 18h16',
  dicts: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Zm0 0A2.5 2.5 0 0 0 6.5 22H20v-5',
  subscribers: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  catalog: 'M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
} as const;

function Icon({ d, size = 24 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const MAIN = [
  { id: 'listings', label: 'Объявления', icon: I.listings },
  { id: 'leads', label: 'Заявки', icon: I.leads },
  { id: 'stats', label: 'Статистика', icon: I.stats },
] as const;

const MORE = [
  { id: 'dicts', label: 'Справочники', hint: 'Города и отрасли', icon: I.dicts },
  { id: 'subscribers', label: 'Подписчики', hint: 'Кто получает уведомления о новых бизнесах', icon: I.subscribers },
] as const;

function haptic() {
  getWebApp().then((wa) => {
    try {
      wa?.HapticFeedback?.selectionChanged?.();
    } catch {
      /* старые клиенты */
    }
  });
}

export default function AdminNav({ active, leadsBadge }: { active: string; leadsBadge: number }) {
  const [sheet, setSheet] = useState(false);
  const moreActive = MORE.some((m) => m.id === active);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    function close() {
      setSheet(false);
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
    };
  }, [sheet]);

  const onTab = (id: string) => (e: MouseEvent) => {
    haptic();
    setSheet(false);
    // Уже на корне этой вкладки — просто наверх.
    if (active === id && location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).length <= 1) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
      {sheet && (
        <div className="admin-sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="admin-sheet" role="dialog" aria-label="Другие разделы" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
            <ul className="flex flex-col gap-1">
              {MORE.map((m) => (
                <li key={m.id}>
                  <a href={`#/${m.id}`} onClick={onTab(m.id)} className="admin-sheet-row" aria-current={active === m.id ? 'page' : undefined}>
                    <span className="admin-sheet-icon"><Icon d={m.icon} /></span>
                    <span className="min-w-0">
                      <span className="block text-base font-bold">{m.label}</span>
                      <span className="block text-sm text-hint">{m.hint}</span>
                    </span>
                  </a>
                </li>
              ))}
              <li>
                <a href="/" className="admin-sheet-row">
                  <span className="admin-sheet-icon"><Icon d={I.catalog} /></span>
                  <span className="min-w-0">
                    <span className="block text-base font-bold">В каталог</span>
                    <span className="block text-sm text-hint">Выйти из админ-панели</span>
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      )}

      <nav className="admin-nav" aria-label="Разделы админ-панели">
        <ul className="mx-auto grid max-w-[640px] grid-cols-4">
          {MAIN.map((t) => (
            <li key={t.id}>
              <a href={`#/${t.id}`} onClick={onTab(t.id)} className="admin-tab" aria-current={active === t.id && !sheet ? 'page' : undefined}>
                <span className="admin-tab-pill">
                  <Icon d={t.icon} />
                  {t.id === 'leads' && leadsBadge > 0 && (
                    <span className="admin-tab-badge" aria-label={`непрочитанных: ${leadsBadge}`}>{leadsBadge > 99 ? '99+' : leadsBadge}</span>
                  )}
                </span>
                <span className="admin-tab-label">{t.label}</span>
              </a>
            </li>
          ))}
          <li>
            <button type="button" className="admin-tab" aria-expanded={sheet} aria-current={(moreActive && !sheet) || sheet ? 'page' : undefined} onClick={() => { haptic(); setSheet((v) => !v); }}>
              <span className="admin-tab-pill"><Icon d={I.more} /></span>
              <span className="admin-tab-label">Ещё</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
