import type { APIRoute } from 'astro';
import { json } from '../../../server/http';
import { verifyWebhook, type PayPalOrder } from '../../../server/paypal';
import { onlinePayments, settlePayPalOrder } from '../../../server/seller';
import { notifyManagers } from '../../../server/telegram';
import { db, env } from '../../../server/site';

/**
 * Вебхук PayPal (Developer Dashboard → Apps → приложение → Webhooks):
 * CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED.
 * Подпись проверяется через API PayPal (нужен PAYPAL_WEBHOOK_ID). Ответ 200 — иначе PayPal повторяет доставку.
 */
interface Event {
  event_type?: string;
  resource?: { id?: string; status?: string; supplementary_data?: { related_ids?: { order_id?: string } } } & Partial<PayPalOrder>;
}

export const POST: APIRoute = async ({ request }) => {
  if (!onlinePayments(env)) return json({ ok: false }, { status: 503 });
  const raw = await request.text();
  if (!(await verifyWebhook(env, request.headers, raw))) return json({ error: 'bad signature' }, { status: 400 });
  let ev: Event;
  try {
    ev = JSON.parse(raw);
  } catch {
    return json({ error: 'bad json' }, { status: 400 });
  }
  const d = db();
  const type = ev.event_type ?? '';
  try {
    if (type === 'CHECKOUT.ORDER.APPROVED' && ev.resource?.id) {
      await settlePayPalOrder(env, d, ev.resource.id);
    } else if (type.startsWith('PAYMENT.CAPTURE.')) {
      const orderId = ev.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId && type === 'PAYMENT.CAPTURE.COMPLETED') await settlePayPalOrder(env, d, orderId);
      else if (orderId) {
        const r = await settlePayPalOrder(env, d, orderId).catch(() => ({ state: 'unknown' }));
        // Возврат / отмена списания: объявление не снимаем автоматически — решает администратор.
        if (type !== 'PAYMENT.CAPTURE.PENDING') {
          await notifyManagers(env, d, `⚠️ PayPal: ${type} по заказу ${orderId}${'businessId' in r && r.businessId ? ` (объявление id ${r.businessId})` : ''}. Проверьте платёж в кабинете PayPal.`);
        }
      }
    }
  } catch (e) {
    console.error('paypal webhook', type, e instanceof Error ? e.message : e);
    return json({ error: 'retry' }, { status: 500 });
  }
  return json({ ok: true });
};
