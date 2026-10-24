import { useEffect, useState } from 'react';
import { api } from './api';
import { useMeta } from './App';
import { NumberInput, dt, useToast } from './ui';
import type { SellerQueue } from './types';

interface Overview {
  settings: { priceIls: number; valuationPriceIls: number; auditPriceIls: number; autoPublish: boolean };
  queue: SellerQueue;
  requests: { id: number; businessId: number; text: string; createdAt: number; lotNumber: number; publicTitle: string }[];
  payment: { paypal: boolean; mode: 'live' | 'sandbox'; webhook: boolean };
}

/** Вкладка «От продавцов»: цена размещения, автопубликация, состояние PayPal, открытые запросы на изменение. */
export default function SellerOverview() {
  const toast = useToast();
  const { reloadMeta } = useMeta();
  const [o, setO] = useState<Overview | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [valuation, setValuation] = useState<number | null>(null);
  const [audit, setAudit] = useState<number | null>(null);

  useEffect(() => {
    api<Overview>('seller').then((r) => {
      setO(r);
      setPrice(r.settings.priceIls);
      setValuation(r.settings.valuationPriceIls);
      setAudit(r.settings.auditPriceIls);
    }).catch((e) => toast((e as Error).message, 'error'));
  }, [toast]);

  async function save(patch: Partial<Overview['settings']>) {
    try {
      const r = await api<{ settings: Overview['settings'] }>('seller/settings', { method: 'PUT', body: patch });
      setO((x) => (x ? { ...x, settings: r.settings } : x));
      setPrice(r.settings.priceIls);
      setValuation(r.settings.valuationPriceIls);
      setAudit(r.settings.auditPriceIls);
      toast('Сохранено');
      reloadMeta();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  if (!o) return null;
  const p = o.payment;
  return (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-col gap-3 p-4 text-sm">
        <h2 className="text-base font-bold">Размещение продавцами</h2>
        <p className="text-hint">
          Продавцы заполняют объявление сами (кнопка «Продать свой бизнес» в боте и в каталоге), черновик сохраняется автоматически.
          После отправки — оплата, затем публикация. Изменить опубликованное объявление продавец может только запросом к вам.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40 flex-1">
            <span className="label">Цена размещения</span>
            <NumberInput value={price} onChange={setPrice} suffix="₪" />
          </label>
          <button className="btn btn-secondary" disabled={price === null || price === o.settings.priceIls} onClick={() => save({ priceIls: price ?? 0 })}>Сохранить цену</button>
        </div>
        <p className="text-xs text-hint">0 ₪ — бесплатно (без оплаты).</p>
        <p className="font-semibold">Дополнительные услуги</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-36 flex-1">
            <span className="label">Оценка стоимости</span>
            <NumberInput value={valuation} onChange={setValuation} suffix="₪" />
          </label>
          <label className="min-w-36 flex-1">
            <span className="label">Финансовый аудит</span>
            <NumberInput value={audit} onChange={setAudit} suffix="₪" />
          </label>
          <button className="btn btn-secondary" disabled={valuation === null || audit === null || (valuation === o.settings.valuationPriceIls && audit === o.settings.auditPriceIls)}
            onClick={() => save({ valuationPriceIls: valuation ?? 0, auditPriceIls: audit ?? 0 })}>Сохранить</button>
        </div>
        <p className="text-xs text-hint">Продавец выбирает услуги при отправке объявления и оплачивает вместе с размещением. Бейдж «Оценка подтверждена» / «Пройден аудит» вы ставите в карточке лота после выполнения.</p>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={o.settings.autoPublish} onChange={(e) => save({ autoPublish: e.target.checked })} />
          <span>Публиковать сразу после оплаты <span className="text-hint">(иначе — после вашей проверки)</span></span>
        </label>
        <div className={`rounded-card p-3 ${p.paypal ? 'bg-success/10' : 'bg-warn'}`}>
          {p.paypal ? (
            <p>
              PayPal подключён · режим <b>{p.mode === 'live' ? 'боевой' : 'тестовый (sandbox)'}</b>
              {p.webhook ? ' · вебхук настроен' : ' · без вебхука (оплаты сверяются раз в минуту)'}
            </p>
          ) : (
            <p>PayPal не подключён: продавцы отправляют объявление, а вы получаете сообщение в группе и отмечаете оплату вручную в карточке лота.</p>
          )}
        </div>
        <p className="text-hint">Ждут проверки: {o.queue.inReview} · ждут оплаты: {o.queue.awaitingPayment}</p>
      </section>

      {o.requests.length > 0 && (
        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-base font-bold">Запросы на изменение · {o.requests.length}</h2>
          <ul className="flex flex-col gap-2">
            {o.requests.map((r) => (
              <li key={r.id}>
                <a href={`#/listings/${r.businessId}`} className="block rounded-card bg-bg p-3 text-sm text-text no-underline">
                  <span className="text-xs text-hint">№{r.lotNumber} · {dt(r.createdAt)}</span>
                  <span className="block truncate font-semibold">{r.publicTitle}</span>
                  <span className="line-clamp-2 block">{r.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
