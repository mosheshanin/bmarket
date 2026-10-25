import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { getWebApp, isTg } from '../scripts/tg';
import { ErrorBox, Spinner, ToastProvider } from './ui';
import type { Meta } from './types';
import Listings from './Listings';
import ListingForm from './ListingForm';
import Leads from './Leads';
import LeadView from './LeadView';
import Dicts from './Dicts';
import Subscribers from './Subscribers';
import Stats from './Stats';
import AdminNav from './Nav';

interface MetaCtx { meta: Meta; reloadMeta: () => Promise<void> }
const Ctx = createContext<MetaCtx>(null!);
export const useMeta = () => useContext(Ctx);

export function navigate(hash: string, replace = false) {
  if (replace) history.replaceState(null, '', hash);
  else history.pushState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function useRoute() {
  const [hash, setHash] = useState(() => location.hash || '#/listings');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/listings');
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean);
}

const TABS = ['listings', 'leads', 'stats', 'dicts', 'subscribers'];

export default function AdminApp() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<{ status: number; text: string } | null>(null);
  const route = useRoute();
  const [tab, sub] = route;

  const reloadMeta = useCallback(async () => {
    try {
      setMeta(await api<Meta>('me'));
      setError(null);
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : 0, text: e instanceof Error ? e.message : 'Ошибка' });
    }
  }, []);

  useEffect(() => {
    (async () => {
      const wa = await getWebApp();
      if (!wa?.initData) {
        setError({ status: 401, text: 'Админ-панель открывается только внутри Telegram, через кнопку бота.' });
        return;
      }
      wa.ready();
      wa.expand();
      try {
        wa.setHeaderColor('secondary_bg_color');
        wa.setBackgroundColor('secondary_bg_color');
      } catch { /* старые клиенты */ }
      wa.MainButton.hide();
      reloadMeta();
    })();
  }, [reloadMeta]);

  // Системная «Назад»: с внутреннего экрана — к списку, со списка — в каталог.
  useEffect(() => {
    let off: (() => void) | undefined;
    getWebApp().then((wa) => {
      if (!wa) return;
      const back = () => {
        if (sub) navigate(`#/${tab}`);
        else location.href = '/';
      };
      wa.BackButton.show();
      wa.BackButton.onClick(back);
      off = () => wa.BackButton.offClick(back);
    });
    return () => off?.();
  }, [tab, sub]);

  if (error) {
    return (
      <div className="mx-auto max-w-md pt-10">
        <ErrorBox error={error.status === 403 ? 'Доступ только для администраторов.' : error.text} onRetry={isTg() && error.status !== 403 ? reloadMeta : undefined} />
        <a className="btn btn-secondary mt-4 w-full" href="/">В каталог</a>
      </div>
    );
  }
  if (!meta) return <Spinner />;

  let screen;
  if (tab === 'leads' && sub) screen = <LeadView id={Number(sub)} />;
  else if (tab === 'leads') screen = <Leads />;
  else if (tab === 'dicts') screen = <Dicts />;
  else if (tab === 'subscribers') screen = <Subscribers />;
  else if (tab === 'stats') screen = <Stats />;
  else if (tab === 'listings' && sub) screen = <ListingForm key={sub} id={sub === 'new' ? null : Number(sub)} />;
  else screen = <Listings />;

  const activeTab = TABS.includes(tab) ? tab : 'listings';
  const badge = meta.leadsSummary.unread || 0;

  return (
    <Ctx.Provider value={{ meta, reloadMeta }}>
      <ToastProvider>
        <div className="admin-screen">{screen}</div>
        <AdminNav active={activeTab} leadsBadge={badge} />
      </ToastProvider>
    </Ctx.Provider>
  );
}
