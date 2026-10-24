import { and, eq, gt, or, sql } from 'drizzle-orm';
import type { InlineKeyboardMarkup } from 'grammy/types';
import type { DB } from '../db/client';
import { businesses, leads, type Lead } from '../db/schema';
import { CONTACT_LABELS, LEAD_STATUS_LABELS, escapeHtml, formatDateTime, formatIls, prettyPhone } from '../lib/format';
import { managersChatId, miniAppLink, siteUrl, sleep, tgApi } from './telegram';

export const LEADS_PER_HOUR_LIMIT = 5;

/** Не более 5 заявок в час с одного IP или Telegram ID (раздел 12.2). */
export async function isRateLimited(db: DB, ipHash: string, tgUserId: number | null, now = Date.now()): Promise<boolean> {
  const since = now - 3_600_000;
  const who = tgUserId ? or(eq(leads.ipHash, ipHash), eq(leads.telegramUserId, tgUserId)) : eq(leads.ipHash, ipHash);
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leads)
    .where(and(gt(leads.createdAt, since), who));
  return (r?.n ?? 0) >= LEADS_PER_HOUR_LIMIT;
}

interface LeadLot {
  lotNumber: number;
  publicTitle: string;
  priceIls: number | null;
}

/** Текст сообщения в группу менеджеров (раздел 6.2). Скрытые поля лота сюда не попадают. */
export function renderLeadMessage(lead: Lead, lot: LeadLot): string {
  const e = escapeHtml;
  const lines = [
    `🆕 <b>Новая заявка №${lead.id}</b>`,
    `Лот №${lot.lotNumber} — ${e(lot.publicTitle)}`,
  ];
  if (lot.priceIls) lines.push(`Цена: ${formatIls(lot.priceIls)}`);
  lines.push('');
  lines.push(`Имя: ${e(lead.name ?? '—')}`);
  if (lead.phone) lines.push(`Телефон: ${e(prettyPhone(lead.phone))}`);
  let contact = CONTACT_LABELS[lead.preferredContact] ?? lead.preferredContact;
  if (lead.preferredContact === 'whatsapp' && lead.phone) {
    contact += ` · <a href="https://wa.me/${lead.phone.replace(/\D/g, '')}">написать</a>`;
  }
  lines.push(`Связаться: ${contact}`);
  if (lead.telegramUsername) lines.push(`Telegram: @${e(lead.telegramUsername)}`);
  else if (lead.telegramUserId) lines.push(`Telegram: <a href="tg://user?id=${lead.telegramUserId}">профиль</a>`);
  if (lead.comment) lines.push(`Комментарий: ${e(lead.comment)}`);
  lines.push('');
  const src = lead.source === 'mini_app' ? 'мини-приложение' : 'сайт';
  const utm = [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ');
  lines.push(`Источник: ${src}${utm ? ` (${e(utm)})` : ''} · ${formatDateTime(lead.createdAt)}`);
  if (lead.status === 'in_progress') {
    lines.push('', `🔧 В работе у ${e(lead.handledByName ?? String(lead.handledBy ?? ''))}`);
  } else if (lead.status !== 'new') {
    const who = lead.handledByName ? ` (${e(lead.handledByName)})` : '';
    lines.push('', `${lead.status === 'closed_won' ? '✅' : '❌'} ${LEAD_STATUS_LABELS[lead.status]}${who}`);
  }
  return lines.join('\n');
}

export function leadKeyboard(env: Env, lead: Lead): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
  if (lead.status === 'new') rows.push([{ text: 'Взять в работу', callback_data: `take:${lead.id}` }]);
  const link = miniAppLink(env, `lead-${lead.id}`) ?? `${siteUrl(env)}/admin#/leads/${lead.id}`;
  rows.push([{ text: 'Открыть в админке', url: link }]);
  return { inline_keyboard: rows };
}

async function lotFor(db: DB, businessId: number): Promise<LeadLot> {
  const [b] = await db
    .select({ lotNumber: businesses.lotNumber, publicTitle: businesses.publicTitle, priceIls: businesses.priceIls })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return b ?? { lotNumber: 0, publicTitle: '—', priceIls: null };
}

/**
 * Отправка заявки в группу менеджеров: 1 попытка + до 3 повторов с паузой.
 * При неудаче заявка помечается «не доставлена» и поднимается вверх списка в админке.
 */
export async function deliverLead(env: Env, db: DB, leadId: number, pauses = [1000, 2000, 4000]): Promise<boolean> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  if (!lead) return false;
  const chat = managersChatId(env);
  if (!chat || !env.TELEGRAM_BOT_TOKEN) {
    await db.update(leads).set({ tgDelivered: false }).where(eq(leads.id, leadId));
    return false;
  }
  const lot = await lotFor(db, lead.businessId);
  const text = renderLeadMessage(lead, lot);
  for (let attempt = 0; attempt <= pauses.length; attempt++) {
    try {
      const msg = await tgApi(env).sendMessage(chat, text, {
        parse_mode: 'HTML',
        reply_markup: leadKeyboard(env, lead),
        link_preview_options: { is_disabled: true },
      });
      await db.update(leads).set({ tgDelivered: true, tgMessageId: msg.message_id }).where(eq(leads.id, leadId));
      return true;
    } catch (e) {
      console.error(`deliverLead #${leadId} attempt ${attempt + 1} failed`, e);
      if (attempt < pauses.length) await sleep(pauses[attempt]);
    }
  }
  await db.update(leads).set({ tgDelivered: false }).where(eq(leads.id, leadId));
  return false;
}

/** Обновить сообщение в группе после смены статуса (в админке или кнопкой). */
export async function syncLeadMessage(env: Env, db: DB, leadId: number): Promise<void> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  const chat = managersChatId(env);
  if (!lead?.tgMessageId || !chat) return;
  const lot = await lotFor(db, lead.businessId);
  try {
    await tgApi(env).editMessageText(chat, lead.tgMessageId, renderLeadMessage(lead, lot), {
      parse_mode: 'HTML',
      reply_markup: leadKeyboard(env, lead),
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    // «message is not modified» и подобное — не критично.
    console.warn('syncLeadMessage', e);
  }
}

/** «Взять в работу»: только из статуса «Новая». Возвращает актуальную заявку. */
export async function takeLead(db: DB, leadId: number, adminId: number, adminName: string) {
  const now = Date.now();
  const updated = await db
    .update(leads)
    .set({ status: 'in_progress', handledBy: adminId, handledByName: adminName, updatedAt: now, isRead: true })
    .where(and(eq(leads.id, leadId), eq(leads.status, 'new')))
    .returning();
  if (updated[0]) return { taken: true as const, lead: updated[0] };
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
  return { taken: false as const, lead };
}
