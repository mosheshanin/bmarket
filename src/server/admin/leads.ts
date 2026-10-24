import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { InputFile } from 'grammy';
import type { DB } from '../../db/client';
import { businesses, leads, LEAD_STATUSES } from '../../db/schema';
import { CONTACT_LABELS, LEAD_STATUS_LABELS, formatDateTime } from '../../lib/format';
import { businessPath } from '../../lib/slug';
import { HttpError } from '../http';
import type { AdminContext } from '../auth';
import { syncLeadMessage } from '../leads';
import { tgApi } from '../telegram';

const listCols = {
  id: leads.id, createdAt: leads.createdAt, businessId: leads.businessId, name: leads.name, phone: leads.phone,
  preferredContact: leads.preferredContact, status: leads.status, isRead: leads.isRead, tgDelivered: leads.tgDelivered,
  source: leads.source, handledByName: leads.handledByName, telegramUsername: leads.telegramUsername,
  lotNumber: businesses.lotNumber, publicTitle: businesses.publicTitle,
};

/** Список заявок: недоставленные в Telegram — вверху, затем новые сверху. */
export async function listLeads(db: DB, f: { status?: string; businessId?: number; limit?: number }) {
  const conds = [];
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(leads.status, f.status as 'new'));
  if (f.businessId) conds.push(eq(leads.businessId, f.businessId));
  return db
    .select(listCols)
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`case when ${leads.tgDelivered} = 0 then 0 else 1 end`, desc(leads.createdAt))
    .limit(Math.min(f.limit ?? 300, 1000));
}

export async function leadsSummary(db: DB) {
  const [r] = await db
    .select({
      unread: sql<number>`sum(case when ${leads.isRead} = 0 then 1 else 0 end)`,
      fresh: sql<number>`sum(case when ${leads.status} = 'new' then 1 else 0 end)`,
      undelivered: sql<number>`sum(case when ${leads.tgDelivered} = 0 then 1 else 0 end)`,
    })
    .from(leads);
  return { unread: r?.unread ?? 0, new: r?.fresh ?? 0, undelivered: r?.undelivered ?? 0 };
}

/** Карточка заявки со скрытыми данными лота (только для администраторов). */
export async function leadDetail(db: DB, id: number) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) throw new HttpError(404, 'Заявка не найдена');
  if (!lead.isRead) await db.update(leads).set({ isRead: true }).where(eq(leads.id, id));
  const [b] = await db
    .select({
      id: businesses.id, lotNumber: businesses.lotNumber, slug: businesses.slug, publicTitle: businesses.publicTitle,
      priceIls: businesses.priceIls, status: businesses.status,
      realName: businesses.realName, exactAddress: businesses.exactAddress, ownerName: businesses.ownerName,
      ownerPhone: businesses.ownerPhone, ownerTelegram: businesses.ownerTelegram, internalNotes: businesses.internalNotes,
    })
    .from(businesses)
    .where(eq(businesses.id, lead.businessId));
  return { lead: { ...lead, isRead: true }, business: b ? { ...b, path: businessPath(b.lotNumber, b.slug) } : null };
}

export async function patchLead(env: Env, db: DB, admin: AdminContext, id: number, patch: { status?: (typeof LEAD_STATUSES)[number]; adminNote?: string | null }) {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) throw new HttpError(404, 'Заявка не найдена');
  const set: Partial<typeof leads.$inferInsert> = { updatedAt: Date.now() };
  if (patch.adminNote !== undefined) set.adminNote = patch.adminNote?.slice(0, 2000) || null;
  const statusChanged = patch.status && patch.status !== lead.status;
  if (statusChanged) {
    set.status = patch.status;
    if (patch.status === 'new') {
      set.handledBy = null;
      set.handledByName = null;
    } else if (!lead.handledBy || lead.status === 'new') {
      set.handledBy = admin.id;
      set.handledByName = admin.name;
    }
  }
  const [updated] = await db.update(leads).set(set).where(eq(leads.id, id)).returning();
  return { lead: updated, statusChanged: !!statusChanged };
}

export { syncLeadMessage };

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Выгрузка за период (CSV, разделитель «;», UTF-8 с BOM — открывается в Excel). */
export async function leadsCsv(db: DB, from: number, to: number): Promise<string> {
  const rows = await db
    .select({ l: leads, lotNumber: businesses.lotNumber, title: businesses.publicTitle })
    .from(leads)
    .innerJoin(businesses, eq(businesses.id, leads.businessId))
    .where(and(gte(leads.createdAt, from), lte(leads.createdAt, to)))
    .orderBy(asc(leads.createdAt));
  const header = ['№', 'Дата', 'Лот', 'Объявление', 'Имя', 'Телефон', 'Как связаться', 'Telegram', 'Комментарий', 'Источник', 'utm_source', 'utm_medium', 'utm_campaign', 'Статус', 'Взял', 'Заметка'];
  const lines = rows.map(({ l, lotNumber, title }) => [
    l.id, formatDateTime(l.createdAt), lotNumber, title, l.name, l.phone, CONTACT_LABELS[l.preferredContact],
    l.telegramUsername ? '@' + l.telegramUsername : l.telegramUserId ?? '', l.comment,
    l.source === 'mini_app' ? 'мини-приложение' : 'сайт', l.utmSource, l.utmMedium, l.utmCampaign,
    LEAD_STATUS_LABELS[l.status], l.handledByName, l.adminNote,
  ].map(csvCell).join(';'));
  return '﻿' + [header.join(';'), ...lines].join('\r\n') + '\r\n';
}

/** Отправить CSV администратору в личные сообщения бота (удобно с телефона). */
export async function sendCsvToAdmin(env: Env, adminId: number, csv: string, filename: string) {
  try {
    await tgApi(env).sendDocument(adminId, new InputFile(new TextEncoder().encode(csv), filename), { caption: 'Выгрузка заявок' });
  } catch (e) {
    throw new HttpError(400, 'Не удалось отправить файл: откройте чат с ботом и нажмите «Старт», затем повторите', { cause: String(e) });
  }
}
