import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describePrefs, matchesPrefs } from '../lib/match';
import { plural } from '../lib/format';
import { afterSplash } from '../scripts/tg';
import Survey from './Survey';
import { EMPTY, fetchFacets, fetchProfile, readLocal, writeLocal, toPrefs, type Answers, type Facets, type OpenListing, type Profile } from './data';

/**
 * Опрос при первом запуске (только мини-приложение, только главная).
 * Показывается после заставки, если включён в админке и пользователь ещё не отвечал (на любом устройстве).
 * `/?survey=1` — предпросмотр для владельца, независимо от переключателя.
 * Ответы → блок «Подборка для вас» над списком.
 */
export async function initOnboarding(): Promise<void> {
  const slot = document.getElementById('for-you');
  if (!slot) return;
  const forced = new URLSearchParams(location.search).has('survey');
  let profile = readLocal();
  let enabled = false;
  let openListing: OpenListing | null = null;
  // Продавцу всегда нужен свежий статус его объявления (черновик могли удалить или отправить).
  if (!profile || forced || profile.intent === 'sell') {
    try {
      const r = await fetchProfile();
      enabled = r.surveyEnabled;
      openListing = r.openListing;
      if (r.profile) {
        profile = r.profile;
        writeLocal(profile);
      }
    } catch {
      /* нет сети — без опроса */
    }
  }
  const open = forced || (enabled && !profile);
  if (open) await afterSplash();
  createRoot(slot).render(<Onboarding initialProfile={profile} openSurvey={open} preview={forced} openListing={openListing} />);
}

interface GridItem { el: HTMLElement; lot: { categoryId: number | null; cityId: number | null; priceIls: number | null; paybackMonths: number | null } }

function gridItems(): GridItem[] {
  const num = (v?: string) => (v ? Number(v) : null);
  return [...document.querySelectorAll<HTMLElement>('[data-listing-grid] > li')].map((el) => ({
    el,
    lot: { categoryId: num(el.dataset.category), cityId: num(el.dataset.city), priceIls: num(el.dataset.price), paybackMonths: num(el.dataset.payback) },
  }));
}

function Onboarding({ initialProfile, openSurvey, preview, openListing }: { initialProfile: Profile | null; openSurvey: boolean; preview: boolean; openListing: OpenListing | null }) {
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [surveyOpen, setSurveyOpen] = useState(openSurvey);
  const [onlyMine, setOnlyMine] = useState(true);
  const [facets, setFacets] = useState<Facets | null>(null);
  const items = useMemo(gridItems, []);

  const buyer = profile?.completed && profile.intent === 'buy';
  const matching = useMemo(
    () => (buyer && profile ? items.filter((i) => matchesPrefs(i.lot, toPrefs(profile))) : []),
    [buyer, profile, items],
  );

  useEffect(() => {
    if (profile?.completed && profile.intent !== 'browse') fetchFacets().then(setFacets).catch(() => {});
  }, [profile]);

  // Фильтр списка: «Для вас» скрывает неподходящие карточки (если есть хоть одна подходящая).
  useEffect(() => {
    const active = buyer && onlyMine && matching.length > 0;
    const set = new Set(matching.map((m) => m.el));
    for (const i of items) i.el.classList.toggle('hidden', active && !set.has(i.el));
  }, [buyer, onlyMine, matching, items]);

  useEffect(() => {
    document.documentElement.style.overflow = surveyOpen ? 'hidden' : '';
  }, [surveyOpen]);

  function done(p: Profile | null) {
    if (p) {
      writeLocal(p);
      setProfile(p);
      setOnlyMine(true);
    }
    setSurveyOpen(false);
    window.scrollTo({ top: 0 });
  }

  const initial: Answers | undefined = profile
    ? { ...EMPTY, ...profile, comment: profile.comment ?? '' }
    : undefined;
  const names = facets && {
    categories: new Map(facets.categories.map((c) => [c.id, c.name])),
    cities: new Map(facets.cities.map((c) => [c.id, c.name])),
  };

  let bar = null;
  if (buyer && profile) {
    const n = matching.length;
    bar = (
      <section className="card mb-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">Подборка для вас</p>
            {names && <p className="mt-0.5 text-sm text-hint">{describePrefs({ ...profile, intent: 'buy' }, names)}</p>}
          </div>
          <button type="button" className="btn-ghost min-h-[44px] shrink-0 text-sm" onClick={() => setSurveyOpen(true)}>Изменить</button>
        </div>
        {n > 0 ? (
          <div className="mt-3 flex gap-2">
            <button type="button" className="chip !min-h-[40px] !text-sm" aria-current={onlyMine ? 'page' : undefined} onClick={() => setOnlyMine(true)}>
              Для вас · {n}
            </button>
            <button type="button" className="chip !min-h-[40px] !text-sm" aria-current={!onlyMine ? 'page' : undefined} onClick={() => setOnlyMine(false)}>
              Все · {items.length}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm">
            Под ваш запрос пока нет {items.length ? 'точных совпадений — показываем весь каталог' : 'предложений'}.
            {profile.notifyMatching ? ' Сообщим, когда появится подходящее.' : ''}
          </p>
        )}
      </section>
    );
  } else if (profile?.completed && profile.intent === 'sell') {
    // Продавцу — только реальное состояние его объявления; нет незавершённого объявления — нет и блока.
    if (openListing) {
      const o = openListing;
      const text = o.stage === 'editing'
        ? { head: `Черновик объявления №${o.lotNumber}`, sub: o.title || 'Без названия — продолжите заполнение', btn: 'Продолжить', href: `/sell?edit=${o.id}` }
        : o.stage === 'awaiting_payment'
          ? { head: `Заявка на размещение №${o.lotNumber} отправлена`, sub: 'Менеджер свяжется, чтобы согласовать оплату.', btn: 'Открыть', href: `/sell?b=${o.id}` }
          : { head: `Объявление №${o.lotNumber} на проверке`, sub: 'После публикации бот пришлёт сообщение.', btn: 'Открыть', href: `/sell?b=${o.id}` };
      bar = (
        <section className="card mb-4 flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-semibold">{text.head}</p>
            <p className="mt-0.5 truncate text-sm text-hint">{text.sub}</p>
          </div>
          <a className="btn btn-primary shrink-0" href={text.href}>{text.btn}</a>
        </section>
      );
    }
  } else if (profile) {
    // Пропустил опрос или «просто смотрю» — ненавязчивый вход обратно.
    bar = (
      <section className="card mb-4 flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="font-semibold">Подобрать под ваш запрос</p>
          <p className="mt-0.5 text-sm text-hint">5 {plural(5, ['вопрос', 'вопроса', 'вопросов'])} · около 30 секунд</p>
        </div>
        <button type="button" className="btn btn-secondary shrink-0" onClick={() => setSurveyOpen(true)}>Подобрать</button>
      </section>
    );
  }

  return (
    <>
      {bar}
      {surveyOpen && <Survey initial={initial} onDone={done} preview={preview} />}
    </>
  );
}
