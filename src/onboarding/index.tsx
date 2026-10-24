import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describePrefs, matchesPrefs } from '../lib/match';
import { plural } from '../lib/format';
import { afterSplash } from '../scripts/tg';
import Survey from './Survey';
import { EMPTY, fetchFacets, fetchProfile, readLocal, writeLocal, toPrefs, type Answers, type Facets, type Profile } from './data';

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
  if (!profile || forced) {
    try {
      const r = await fetchProfile();
      enabled = r.surveyEnabled;
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
  createRoot(slot).render(<Onboarding initialProfile={profile} openSurvey={open} preview={forced} />);
}

interface GridItem { el: HTMLElement; lot: { categoryId: number | null; cityId: number | null; priceIls: number | null; paybackMonths: number | null } }

function gridItems(): GridItem[] {
  const num = (v?: string) => (v ? Number(v) : null);
  return [...document.querySelectorAll<HTMLElement>('[data-listing-grid] > li')].map((el) => ({
    el,
    lot: { categoryId: num(el.dataset.category), cityId: num(el.dataset.city), priceIls: num(el.dataset.price), paybackMonths: num(el.dataset.payback) },
  }));
}

function Onboarding({ initialProfile, openSurvey, preview }: { initialProfile: Profile | null; openSurvey: boolean; preview: boolean }) {
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
    const q = new URLSearchParams({ new: '1' });
    if (profile.categories[0]) q.set('category', String(profile.categories[0]));
    if (profile.cities[0]) q.set('city', String(profile.cities[0]));
    bar = (
      <section className="card mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Продаёте бизнес{names && profile.categories[0] ? ` · ${names.categories.get(profile.categories[0])}` : ''}</p>
          <p className="mt-0.5 text-sm text-hint">Разместите объявление — черновик сохраняется автоматически.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <a className="btn btn-primary" href={`/sell?${q}`}>Разместить</a>
          <button type="button" className="btn btn-secondary" onClick={() => setSurveyOpen(true)}>Ответы</button>
        </div>
      </section>
    );
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
