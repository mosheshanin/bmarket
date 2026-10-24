import { useEffect, useRef, useState } from 'react';
import { getUtm, getWebApp, initData, isTg, fetchSubscription, requestSubscribe, visitorId, track } from '../scripts/tg';

interface Props {
  businessId: number;
  lotNumber: number;
  title: string;
  priceStr: string | null;
  cardPath: string;
  turnstileSiteKey: string;
}

type Contact = 'phone' | 'whatsapp' | 'telegram';

const PHONE_RE = /^(0(5\d|[2-4]|[89]|7\d)\d{7}|\+[1-9]\d{7,14})$/;
export function phoneLooksValid(raw: string) {
  return PHONE_RE.test(raw.replace(/[\s\-()]/g, ''));
}

export default function LeadForm({ businessId, lotNumber, title, priceStr, cardPath, turnstileSiteKey }: Props) {
  const [tg, setTg] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contact, setContact] = useState<Contact>('phone');
  const [comment, setComment] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // ловушка для ботов
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState(false);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [canShareContact, setCanShareContact] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileToken = useRef('');
  const submitRef = useRef<() => void>(() => {});

  // Telegram: имя из профиля, способ связи по умолчанию — Telegram.
  useEffect(() => {
    const inTg = isTg();
    setTg(inTg);
    if (inTg) setContact('telegram');
    track('lead_form_open', businessId);
    getWebApp().then((wa) => {
      if (!wa) return;
      const u = wa.initDataUnsafe.user;
      if (u) setName((n) => n || [u.first_name, u.last_name].filter(Boolean).join(' ').slice(0, 60));
      setCanShareContact(wa.isVersionAtLeast('6.9'));
      wa.MainButton.setText('Отправить заявку').show().enable();
      const handler = () => submitRef.current();
      wa.MainButton.onClick(handler);
    });
    return () => {
      getWebApp().then((wa) => wa?.MainButton.hide());
    };
  }, [businessId]);

  // Веб-версия: Cloudflare Turnstile.
  useEffect(() => {
    if (isTg() || !turnstileSiteKey || !turnstileRef.current) return;
    const render = () => {
      if (!window.turnstile || !turnstileRef.current) return;
      window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        language: 'ru',
        callback: (t: string) => (turnstileToken.current = t),
        'expired-callback': () => (turnstileToken.current = ''),
      });
    };
    if (window.turnstile) return render();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [turnstileSiteKey]);

  function validate() {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (n.length < 2 || n.length > 60) e.name = 'Укажите имя: от 2 до 60 символов';
    if (!phoneLooksValid(phone)) e.phone = 'Телефон в формате 05X-XXX-XXXX или международный с «+»';
    if (comment.length > 500) e.comment = 'Не больше 500 символов';
    if (!consent) e.consent = 'Нужно согласие с политикой конфиденциальности';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (sending || done) return;
    setServerError('');
    const wa = await getWebApp();
    if (!validate()) {
      wa?.HapticFeedback?.notificationOccurred('error');
      return;
    }
    if (!tg && turnstileSiteKey && !turnstileToken.current) {
      setServerError('Подтвердите, что вы не робот');
      return;
    }
    setSending(true);
    wa?.MainButton.showProgress();
    try {
      const r = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessId,
          name: name.trim(),
          phone: phone.trim(),
          preferredContact: contact,
          comment: comment.trim() || undefined,
          consent: true,
          website,
          turnstileToken: turnstileToken.current || undefined,
          initData: (await initData()) || undefined,
          utm: getUtm(),
          visitorId: visitorId(),
        }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(data.error || 'Не удалось отправить заявку');
      setDone(true);
      wa?.HapticFeedback?.notificationOccurred('success');
      wa?.MainButton.hide();
      window.scrollTo({ top: 0 });
      if (wa) fetchSubscription().then(setSubscribed);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Не удалось отправить заявку');
      wa?.HapticFeedback?.notificationOccurred('error');
      if (window.turnstile) window.turnstile.reset();
      turnstileToken.current = '';
    } finally {
      setSending(false);
      wa?.MainButton.hideProgress();
    }
  }
  submitRef.current = submit;

  async function shareContact() {
    const wa = await getWebApp();
    wa?.requestContact((ok, res) => {
      const p = res?.responseUnsafe?.contact?.phone_number;
      if (ok && p) setPhone(p.startsWith('+') ? p : '+' + p);
    });
  }

  if (done) {
    return (
      <div className="card p-6 text-center" role="status">
        <p className="text-4xl" aria-hidden="true">✅</p>
        <h1 className="mt-2 text-xl font-bold">Спасибо!</h1>
        <p className="mt-1">Менеджер свяжется с вами в течение рабочего дня.</p>
        <a href="/" className="btn btn-primary mt-5 w-full sm:w-auto">Вернуться в каталог</a>
        {tg && subscribed === false && (
          <div className="mt-5 rounded-card border border-line p-4 text-left">
            <p className="font-semibold">Получать уведомления о новых бизнесах?</p>
            <button type="button" className="btn btn-secondary mt-2 w-full" onClick={async () => setSubscribed(await requestSubscribe())}>
              Получать уведомления
            </button>
          </div>
        )}
        {tg && subscribed === true && <p className="mt-4 text-sm text-hint">✓ Вы подписаны на новые бизнесы</p>}
      </div>
    );
  }

  const err = (k: string) => errors[k] && <p className="mt-1 text-sm text-danger" id={`${k}-err`}>{errors[k]}</p>;

  return (
    <form
      className="card flex flex-col gap-4 p-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <p className="text-sm text-hint">Заявка по лоту №{lotNumber}</p>
        <h1 className="text-xl font-bold leading-snug">{title}</h1>
        {priceStr && <p className="mt-0.5 font-semibold">{priceStr}</p>}
      </div>

      <div>
        <label className="label" htmlFor="lf-name">Имя</label>
        <input id="lf-name" className="field" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} />
        {err('name')}
      </div>

      <div>
        <label className="label" htmlFor="lf-phone">Телефон</label>
        <div className="flex gap-2">
          <input id="lf-phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="05X-XXX-XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? 'phone-err' : undefined} />
          {tg && canShareContact && (
            <button type="button" className="btn btn-secondary shrink-0 text-sm" onClick={shareContact}>Поделиться номером</button>
          )}
        </div>
        {err('phone')}
      </div>

      <fieldset>
        <legend className="label">Как с вами связаться</legend>
        <div className="grid grid-cols-3 gap-2">
          {(['phone', 'whatsapp', 'telegram'] as Contact[]).map((c) => (
            <label key={c} className={`chip justify-center !shadow-none border ${contact === c ? 'border-accent !bg-accent !text-accent-text' : 'border-line'}`}>
              <input type="radio" name="contact" value={c} checked={contact === c} onChange={() => setContact(c)} className="sr-only" />
              {c === 'phone' ? 'Телефон' : c === 'whatsapp' ? 'WhatsApp' : 'Telegram'}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="lf-comment">Комментарий <span className="font-normal text-hint">(необязательно)</span></label>
        <textarea id="lf-comment" className="field min-h-24" maxLength={500} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: интересует оборот за последний год" />
        <p className="mt-1 text-right text-xs text-hint">{comment.length} / 500</p>
        {err('comment')}
      </div>

      {/* Ловушка для ботов: людям не видна */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label>Сайт<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" /></label>
      </div>

      <div>
        <label className="flex min-h-[44px] items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={!!errors.consent} />
          <span className="text-sm">
            Я согласен(на) с <a href="/privacy" target={tg ? undefined : '_blank'}>политикой конфиденциальности</a> и обработкой моих данных для связи по заявке
          </span>
        </label>
        {err('consent')}
      </div>

      {!tg && turnstileSiteKey && <div ref={turnstileRef} className="min-h-[65px]" />}

      {serverError && <p className="rounded-card bg-danger/10 p-3 text-sm text-danger" role="alert">{serverError}</p>}

      {!tg && (
        <button type="submit" className="btn btn-primary w-full" disabled={sending}>
          {sending ? 'Отправляем…' : 'Отправить заявку'}
        </button>
      )}
      <a href={cardPath} className="web-only btn btn-ghost">← Назад к объявлению</a>
    </form>
  );
}
