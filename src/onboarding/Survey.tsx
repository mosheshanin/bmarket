import { useEffect, useMemo, useState } from 'react';
import { BUDGETS, BUYER_WISHES, SELLER_WISHES, TIMELINES, describePrefs, matchesPrefs } from '../lib/match';
import { formatIls, plural } from '../lib/format';
import { getWebApp, requestSubscribe, track } from '../scripts/tg';
import { EMPTY, fetchFacets, requestConsult, saveAnswers, setNotify, toPrefs, type Answers, type Facets, type Intent, type Profile } from './data';

/**
 * Опрос при первом запуске: 4–5 коротких вопросов, ответы — касанием.
 * Вовлечение без игровых элементов: честный прогресс и время, живой счётчик подходящих предложений,
 * реальные цифры спроса для продавцов, сразу полезный итог (подборка, уведомления, менеджер).
 */

type Step = 'intent' | 'categories' | 'category' | 'cities' | 'city' | 'budget' | 'timeline' | 'wishes' | 'result';
const FLOW: Record<Intent, Step[]> = {
  buy: ['intent', 'categories', 'cities', 'budget', 'wishes', 'result'],
  sell: ['intent', 'category', 'city', 'timeline', 'wishes', 'result'],
  browse: ['intent'],
};

const offers = (n: number) => `${n} ${plural(n, ['предложение', 'предложения', 'предложений'])}`;

function haptic() {
  getWebApp().then((wa) => wa?.HapticFeedback?.impactOccurred('light')).catch(() => {});
}

// Простые линейные значки (без эмодзи).
const Icon = ({ d }: { d: string }) => (
  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent" aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  </span>
);
const ICONS = {
  buy: 'M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6',
  sell: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01',
  browse: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
};

export default function Survey({ initial, onDone, preview }: { initial?: Answers; onDone: (p: Profile | null) => void; preview?: boolean }) {
  const [a, setA] = useState<Answers>(initial ?? EMPTY);
  const [stepIdx, setStepIdx] = useState(0);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchFacets().then(setFacets).catch(() => {});
    track('survey_open');
  }, []);

  const flow = FLOW[a.intent ?? 'buy'];
  const step = flow[stepIdx];
  const questions = a.intent ? flow.length - 1 : 5;
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));
  const toggle = (k: 'categories' | 'cities', id: number) =>
    set({ [k]: a[k].includes(id) ? a[k].filter((x) => x !== id) : [...a[k], id] } as Partial<Answers>);
  const toggleWish = (w: string) => set({ wishes: a.wishes.includes(w) ? a.wishes.filter((x) => x !== w) : [...a.wishes, w] });

  const matching = useMemo(
    () => (facets ? facets.lots.filter((l) => matchesPrefs(l, toPrefs(a))) : []),
    [facets, a],
  );
  const names = useMemo(() => ({
    categories: new Map((facets?.categories ?? []).map((c) => [c.id, c.name])),
    cities: new Map((facets?.cities ?? []).map((c) => [c.id, c.name])),
  }), [facets]);
  const lotsIn = (k: 'categoryId' | 'cityId', id: number) => facets?.lots.filter((l) => l[k] === id).length ?? 0;

  async function finish(status: 'completed' | 'skipped', answers = a) {
    setSaving(true);
    setError('');
    try {
      const r = await saveAnswers(answers, status);
      return r.profile;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    haptic();
    if (flow[stepIdx + 1] === 'result') {
      const p = await finish('completed');
      if (!p) return;
      setProfile(p);
    }
    setStepIdx((i) => i + 1);
    document.getElementById('survey-scroll')?.scrollTo({ top: 0 });
  }

  async function chooseIntent(intent: Intent) {
    haptic();
    const answers = { ...a, intent };
    setA(answers);
    if (intent === 'browse') {
      const p = await finish('completed', answers);
      onDone(p);
      return;
    }
    setTimeout(() => setStepIdx(1), 140);
  }

  /** Вопрос с одним ответом: отметить и перейти дальше. */
  function pickAndGo(patch: Partial<Answers>) {
    set(patch);
    haptic();
    setTimeout(() => setStepIdx((i) => i + 1), 160);
  }

  async function skip() {
    // Предпросмотр или повторное прохождение — просто закрыть, ответы не трогаем.
    if (preview || initial) return onDone(null);
    const p = await finish('skipped');
    onDone(p);
  }

  const showCounter = a.intent === 'buy' && step !== 'intent' && step !== 'result' && facets;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label="Несколько вопросов">
      {step !== 'result' && (
        <header className="mx-auto w-full max-w-md px-4 pt-[calc(env(safe-area-inset-top)+12px)]">
          <div className="flex items-center justify-between gap-3 text-sm text-hint">
            <span>{stepIdx === 0 ? `${questions} ${plural(questions, ['короткий вопрос', 'коротких вопроса', 'коротких вопросов'])} · около 30 секунд` : `Вопрос ${stepIdx + 1} из ${questions}`}</span>
            <button type="button" className="min-h-[44px] px-1 text-hint underline-offset-2 hover:underline" onClick={skip} disabled={saving}>
              {preview || initial ? 'Закрыть' : 'Пропустить'}
            </button>
          </div>
          <div className="mt-1 flex gap-1" aria-hidden="true">
            {Array.from({ length: questions }, (_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIdx ? 'bg-accent' : 'bg-line'}`} />
            ))}
          </div>
        </header>
      )}

      <div id="survey-scroll" className="flex-1 overflow-y-auto">
        <div key={step} className="survey-step mx-auto flex w-full max-w-md flex-col gap-3 px-4 pb-6 pt-5">
          {step === 'intent' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">Что вас привело в каталог?</h2>
              <p className="text-hint">От ответа зависит, что мы покажем первым. Изменить можно в любой момент.</p>
              {([
                ['buy', 'Хочу купить бизнес', 'Подберём предложения под бюджет, сферу и город'],
                ['sell', 'Хочу продать бизнес', 'Покажем спрос и поможем разместить объявление'],
                ['browse', 'Пока просто смотрю', 'Сразу откроем весь каталог'],
              ] as [Intent, string, string][]).map(([k, title, sub]) => (
                <button key={k} type="button" className="survey-option" aria-pressed={a.intent === k} onClick={() => chooseIntent(k)} disabled={saving}>
                  <Icon d={ICONS[k]} />
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block text-sm text-hint">{sub}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {step === 'categories' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">Какая сфера интересует?</h2>
              <p className="text-hint">Можно выбрать несколько. Цифра — сколько предложений в каталоге сейчас.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="survey-chip" aria-pressed={!a.categories.length} onClick={() => set({ categories: [] })}>Любая сфера</button>
                {facets?.categories.map((c) => {
                  const n = lotsIn('categoryId', c.id);
                  return (
                    <button key={c.id} type="button" className="survey-chip" aria-pressed={a.categories.includes(c.id)} onClick={() => toggle('categories', c.id)}>
                      {c.name}{n > 0 && <span className="text-sm text-hint">{n}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 'cities' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">Где ищете?</h2>
              <p className="text-hint">Можно выбрать несколько городов.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="survey-chip" aria-pressed={!a.cities.length} onClick={() => set({ cities: [] })}>Вся страна</button>
                {facets?.cities.map((c) => {
                  const n = lotsIn('cityId', c.id);
                  return (
                    <button key={c.id} type="button" className="survey-chip" aria-pressed={a.cities.includes(c.id)} onClick={() => toggle('cities', c.id)}>
                      {c.name}{n > 0 && <span className="text-sm text-hint">{n}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 'budget' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">На какой бюджет рассчитываете?</h2>
              <p className="text-hint">Цены в каталоге — в шекелях, без учёта торга.</p>
              {BUDGETS.map((b) => (
                <button key={b.key} type="button" className="survey-option !min-h-[56px]" aria-pressed={a.budget === b.key} onClick={() => pickAndGo({ budget: b.key })}>
                  <span className="font-semibold">{b.label}</span>
                </button>
              ))}
            </>
          )}

          {step === 'category' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">Какой у вас бизнес?</h2>
              <div className="flex flex-wrap gap-2">
                {facets?.categories.map((c) => (
                  <button key={c.id} type="button" className="survey-chip" aria-pressed={a.categories[0] === c.id} onClick={() => pickAndGo({ categories: [c.id] })}>{c.name}</button>
                ))}
              </div>
            </>
          )}

          {step === 'city' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">В каком городе?</h2>
              <p className="text-hint">Точный адрес мы не публикуем.</p>
              <div className="flex flex-wrap gap-2">
                {facets?.cities.map((c) => (
                  <button key={c.id} type="button" className="survey-chip" aria-pressed={a.cities[0] === c.id} onClick={() => pickAndGo({ cities: [c.id] })}>{c.name}</button>
                ))}
              </div>
            </>
          )}

          {step === 'timeline' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">Когда планируете продажу?</h2>
              {TIMELINES.map((t) => (
                <button key={t.key} type="button" className="survey-option" aria-pressed={a.timeline === t.key} onClick={() => pickAndGo({ timeline: t.key })}>
                  <span>
                    <span className="block font-semibold">{t.label}</span>
                    <span className="block text-sm text-hint">{t.hint}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          {step === 'wishes' && (
            <>
              <h2 className="text-2xl font-extrabold leading-tight">{a.intent === 'sell' ? 'Что для вас важно?' : 'Есть пожелания?'}</h2>
              <p className="text-hint">Необязательно. Менеджер учтёт это, когда будет с вами говорить.</p>
              <div className="flex flex-wrap gap-2">
                {(a.intent === 'sell' ? SELLER_WISHES : BUYER_WISHES).map((w) => (
                  <button key={w.key} type="button" className="survey-chip" aria-pressed={a.wishes.includes(w.key)} onClick={() => toggleWish(w.key)}>{w.label}</button>
                ))}
              </div>
              <label className="mt-2 block">
                <span className="label">Своими словами</span>
                <textarea className="field min-h-24" maxLength={500} value={a.comment} onChange={(e) => set({ comment: e.target.value })}
                  placeholder={a.intent === 'sell' ? 'Например: хочу продать до конца года, оборудование новое' : 'Например: ищу кафе с террасой, готов вложиться в ремонт'} />
              </label>
            </>
          )}

          {step === 'result' && facets && (
            a.intent === 'sell'
              ? <SellerResult a={a} facets={facets} names={names} onDone={() => onDone(profile)} />
              : <BuyerResult a={a} matching={matching} total={facets.lots.length} names={names} profile={profile} onDone={(p) => onDone(p ?? profile)} />
          )}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        </div>
      </div>

      {step !== 'intent' && step !== 'result' && (
        <footer className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2">
          {showCounter && (
            <p className="mb-2 text-center text-sm" aria-live="polite">
              Подходит сейчас: <b className="survey-count">{matching.length}</b> из {facets.lots.length}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={saving}>Назад</button>
            {['categories', 'cities', 'wishes'].includes(step) && (
              <button type="button" className="btn btn-primary flex-1" onClick={next} disabled={saving}>
                {saving ? 'Сохраняем…' : step === 'wishes' ? 'Готово' : 'Далее'}
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

type Names = { categories: Map<number, string>; cities: Map<number, string> };

function useConsult() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  async function send() {
    setState('sending');
    const wa = await getWebApp();
    // Номер телефона — через системное окно Telegram (можно отказаться: менеджер напишет в Telegram).
    const phone = await new Promise<string | null>((resolve) => {
      if (!wa?.requestContact) return resolve(null);
      try {
        wa.requestContact((ok, res) => resolve(ok ? res?.responseUnsafe?.contact?.phone_number ?? null : null));
      } catch {
        resolve(null);
      }
    });
    try {
      await requestConsult(phone);
      setState('sent');
    } catch {
      setState('idle');
    }
  }
  return { state, send };
}

function BuyerResult({ a, matching, total, names, profile, onDone }: {
  a: Answers; matching: Facets['lots']; total: number; names: Names; profile: Profile | null; onDone: (p: Profile | null) => void;
}) {
  const [notify, setNotifyState] = useState<'idle' | 'on' | 'denied'>(profile?.notifyMatching ? 'on' : 'idle');
  const consult = useConsult();
  const n = matching.length;

  async function enableNotify() {
    if (await requestSubscribe()) {
      await setNotify(true).catch(() => {});
      setNotifyState('on');
    } else setNotifyState('denied');
  }

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Ваша подборка</p>
      <h2 className="text-2xl font-extrabold leading-tight">
        {n === 0 ? 'Точных совпадений пока нет' : n === total && n > 1 ? `Подходят все ${offers(n)}` : `${plural(n, ['Подходит', 'Подходят', 'Подходят'])} ${offers(n)} из ${total}`}
      </h2>
      <p className="text-hint">{describePrefs({ ...a, intent: 'buy' }, names)}</p>

      {n > 0 && (
        <ul className="flex flex-col gap-2">
          {matching.slice(0, 3).map((l) => (
            <li key={l.id}>
              <a href={l.path} className="card flex items-center gap-3 p-2 text-text no-underline">
                <span className="h-14 w-[74px] shrink-0 overflow-hidden rounded-lg bg-line">
                  {l.img && <img src={l.img} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{l.title}</span>
                  <span className="block text-sm text-hint">{l.priceIls ? formatIls(l.priceIls) : 'Цена по запросу'}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <section className="card mt-1 p-4">
        <p className="font-semibold">{n > 0 ? 'Сообщать о новых подходящих' : 'Сообщим, когда появится подходящее'}</p>
        <p className="mt-1 text-sm text-hint">Бот пришлёт сообщение только о предложениях под ваш запрос.</p>
        {notify === 'on'
          ? <p className="mt-2 text-sm font-semibold text-success">✓ Включено</p>
          : <button type="button" className="btn btn-secondary mt-3 w-full" onClick={enableNotify}>{notify === 'denied' ? 'Разрешить сообщения от бота' : 'Включить уведомления'}</button>}
      </section>

      <section className="card p-4">
        <p className="font-semibold">Подбор с менеджером</p>
        <p className="mt-1 text-sm text-hint">Не все владельцы публикуют объявления открыто. Менеджер расскажет о вариантах вне каталога.</p>
        {consult.state === 'sent'
          ? <p className="mt-2 text-sm font-semibold text-success">✓ Запрос отправлен — менеджер свяжется с вами в рабочее время</p>
          : <button type="button" className="btn btn-secondary mt-3 w-full" onClick={consult.send} disabled={consult.state === 'sending'}>Связаться с менеджером</button>}
      </section>

      <button type="button" className="btn btn-primary mt-1 w-full" onClick={() => onDone(profile ? { ...profile, notifyMatching: notify === 'on' } : null)}>
        {n > 0 ? 'Смотреть подборку' : 'Смотреть весь каталог'}
      </button>
    </>
  );
}

function SellerResult({ a, facets, names, onDone }: { a: Answers; facets: Facets; names: Names; onDone: () => void }) {
  const consult = useConsult();
  const cat = a.categories[0];
  const catName = cat ? names.categories.get(cat) : null;
  const buyers = cat ? facets.demand.buyersByCategory[cat] ?? 0 : facets.demand.buyersTotal;
  const views = cat ? facets.demand.viewsByCategory30d[cat] ?? 0 : 0;
  // Показываем только реальные и достаточно заметные цифры.
  const demand = buyers >= 3
    ? `${buyers} ${plural(buyers, ['покупатель', 'покупателя', 'покупателей'])} в каталоге ${plural(buyers, ['ищет', 'ищут', 'ищут'])} бизнес${catName ? ` в сфере «${catName}»` : ''}.`
    : views >= 10
      ? `Объявления${catName ? ` в сфере «${catName}»` : ''} посмотрели ${views} ${plural(views, ['раз', 'раза', 'раз'])} за последние 30 дней.`
      : 'Объявление увидят посетители каталога и подписчики бота — новые предложения приходят им в Telegram.';
  const q = new URLSearchParams({ new: '1' });
  if (cat) q.set('category', String(cat));
  if (a.cities[0]) q.set('city', String(a.cities[0]));

  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-wide text-accent">Продажа бизнеса</p>
      <h2 className="text-2xl font-extrabold leading-tight">{catName ? `${catName}${a.cities[0] ? `, ${names.cities.get(a.cities[0])}` : ''}` : 'Ваш бизнес'}</h2>
      <section className="card p-4">
        <p className="font-semibold">Спрос</p>
        <p className="mt-1 text-sm">{demand}</p>
      </section>
      <section className="card p-4">
        <p className="font-semibold">Разместить объявление самостоятельно</p>
        <p className="mt-1 text-sm text-hint">Около 10 минут. Черновик сохраняется автоматически, название и адрес покупатели не увидят.</p>
        <a className="btn btn-primary mt-3 w-full" href={`/sell?${q}`}>Разместить объявление</a>
      </section>
      <section className="card p-4">
        <p className="font-semibold">Консультация менеджера</p>
        <p className="mt-1 text-sm text-hint">{a.wishes.includes('valuation') ? 'Обсудим оценку стоимости и условия продажи.' : 'Обсудим цену, документы и порядок продажи.'}</p>
        {consult.state === 'sent'
          ? <p className="mt-2 text-sm font-semibold text-success">✓ Запрос отправлен — менеджер свяжется с вами в рабочее время</p>
          : <button type="button" className="btn btn-secondary mt-3 w-full" onClick={consult.send} disabled={consult.state === 'sending'}>Получить консультацию</button>}
      </section>
      <button type="button" className="btn btn-ghost w-full" onClick={onDone}>Сначала посмотреть каталог</button>
    </>
  );
}
