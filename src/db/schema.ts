import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Модель данных (раздел 4 ТЗ).
 * Все даты — Unix-время в миллисекундах (integer), кроме дат календаря (YYYY-MM-DD).
 *
 * ВАЖНО: поля, помеченные HIDDEN, никогда не попадают в публичный API, HTML и карту сайта.
 * Публичные выборки идут только через src/server/public.ts (явный список полей).
 */

export const cities = sqliteTable('cities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** Предложный падеж для заголовков: «в Хайфе». */
  namePrepositional: text('name_prepositional').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [uniqueIndex('cities_slug_uq').on(t.slug)]);

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [uniqueIndex('categories_slug_uq').on(t.slug)]);

export const LEGAL_FORMS = ['company', 'osek_murshe', 'osek_patur', 'other'] as const;
export const LICENSE_STATES = ['yes', 'not_required', 'in_progress'] as const;
export const INCLUDED_ITEMS = [
  'equipment', 'furniture', 'inventory', 'client_base', 'website_social', 'brand', 'licenses',
] as const;
/** deleted — удалённый черновик: строка остаётся, чтобы номер лота не переиспользовался, а фото удалились через 30 дней. */
export const BUSINESS_STATUSES = ['draft', 'published', 'hidden', 'deleted'] as const;
/**
 * Этап объявления, которое подал продавец (у созданных администратором — null):
 * editing — продавец заполняет черновик; awaiting_payment — отправлено, ждёт оплаты;
 * in_review — оплачено, ждёт проверки администратором; approved — опубликовано (правки — только через запрос).
 */
export const SELLER_STAGES = ['editing', 'awaiting_payment', 'in_review', 'approved'] as const;

export const businesses = sqliteTable('businesses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lotNumber: integer('lot_number').notNull(),
  slug: text('slug').notNull().default(''),
  publicTitle: text('public_title').notNull().default(''),
  categoryId: integer('category_id').references(() => categories.id),
  cityId: integer('city_id').references(() => cities.id),
  areaNote: text('area_note'),
  priceIls: integer('price_ils'),
  priceNegotiable: integer('price_negotiable', { mode: 'boolean' }).notNull().default(false),
  monthlyRevenueIls: integer('monthly_revenue_ils'),
  monthlyProfitIls: integer('monthly_profit_ils'),
  /** Считается при сохранении: цена / прибыль в месяц. */
  paybackMonths: integer('payback_months'),
  yearFounded: integer('year_founded'),
  employeesCount: integer('employees_count'),
  areaSqm: integer('area_sqm'),
  rentMonthlyIls: integer('rent_monthly_ils'),
  leaseUntil: text('lease_until'),
  legalForm: text('legal_form', { enum: LEGAL_FORMS }),
  businessLicense: text('business_license', { enum: LICENSE_STATES }),
  /** JSON-массив значений из INCLUDED_ITEMS. */
  includedInSale: text('included_in_sale', { mode: 'json' }).$type<string[]>().notNull().default([]),
  ownerSupport: text('owner_support'),
  reasonForSale: text('reason_for_sale'),
  shortDescription: text('short_description').notNull().default(''),
  description: text('description').notNull().default(''),
  videoUrl: text('video_url'),
  isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
  /** Бейдж «Оценка подтверждена»: когда эксперты завершили оценку (ставит администратор). */
  valuationVerifiedAt: integer('valuation_verified_at'),
  /** Бейдж «Пройден аудит»: когда завершён экспертный финансовый аудит (ставит администратор). */
  auditPassedAt: integer('audit_passed_at'),
  status: text('status', { enum: BUSINESS_STATUSES }).notNull().default('draft'),
  publishedAt: integer('published_at'),
  /** Когда по лоту была рассылка подписчикам (повторно не рассылается). */
  notifiedAt: integer('notified_at'),

  // ---- HIDDEN: не видно посетителям ----
  realName: text('real_name'),
  exactAddress: text('exact_address'),
  ownerName: text('owner_name'),
  ownerPhone: text('owner_phone'),
  ownerTelegram: text('owner_telegram'),
  internalNotes: text('internal_notes'),
  /** Telegram ID продавца, подавшего объявление сам. */
  sellerTgId: integer('seller_tg_id'),
  sellerStage: text('seller_stage', { enum: SELLER_STAGES }),
  /** Платные услуги, заказанные продавцом: valuation (оценка), audit (аудит). */
  extrasOrdered: text('extras_ordered', { mode: 'json' }).$type<string[]>().notNull().default([]),
  // ---- /HIDDEN ----

  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
}, (t) => [
  uniqueIndex('businesses_lot_uq').on(t.lotNumber),
  index('businesses_status_pub_idx').on(t.status, t.publishedAt),
  index('businesses_status_city_idx').on(t.status, t.cityId),
  index('businesses_seller_idx').on(t.sellerTgId),
]);

export const businessPhotos = sqliteTable('business_photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  /** Фото 1600 px; копия 600 px — r2KeySmall. */
  r2Key: text('r2_key').notNull(),
  r2KeySmall: text('r2_key_small').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  alt: text('alt'),
  createdAt: integer('created_at').notNull(),
  /** Удалённые фото стираются из R2 через 30 дней. */
  deletedAt: integer('deleted_at'),
}, (t) => [index('photos_business_idx').on(t.businessId, t.sortOrder)]);

export const LEAD_STATUSES = ['new', 'in_progress', 'closed_won', 'closed_lost'] as const;
export const CONTACT_METHODS = ['phone', 'whatsapp', 'telegram'] as const;

export const leads = sqliteTable('leads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  name: text('name'),
  phone: text('phone'),
  preferredContact: text('preferred_contact', { enum: CONTACT_METHODS }).notNull(),
  comment: text('comment'),
  telegramUserId: integer('telegram_user_id'),
  telegramUsername: text('telegram_username'),
  source: text('source', { enum: ['mini_app', 'web'] }).notNull(),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  utmTerm: text('utm_term'),
  consentAt: integer('consent_at').notNull(),
  status: text('status', { enum: LEAD_STATUSES }).notNull().default('new'),
  adminNote: text('admin_note'),
  handledBy: integer('handled_by'),
  handledByName: text('handled_by_name'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  /** null — отправка идёт, true — доставлена в группу, false — не доставлена. */
  tgDelivered: integer('tg_delivered', { mode: 'boolean' }),
  tgMessageId: integer('tg_message_id'),
  /** В какую группу ушло сообщение (ID меняется при переходе группы в супергруппу). */
  tgChatId: text('tg_chat_id'),
  /** Хеш IP — только для ограничения 5 заявок в час; сам IP не хранится. */
  ipHash: text('ip_hash'),
  /** Через 24 месяца имя, телефон и комментарий стираются. */
  anonymizedAt: integer('anonymized_at'),
}, (t) => [
  index('leads_created_idx').on(t.createdAt),
  index('leads_business_idx').on(t.businessId),
  index('leads_status_idx').on(t.status),
  index('leads_ip_idx').on(t.ipHash, t.createdAt),
  index('leads_tg_idx').on(t.telegramUserId, t.createdAt),
]);

export const subscribers = sqliteTable('subscribers', {
  telegramUserId: integer('telegram_user_id').primaryKey(),
  firstName: text('first_name'),
  username: text('username'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  subscribedAt: integer('subscribed_at').notNull(),
  unsubscribedAt: integer('unsubscribed_at'),
  blockedAt: integer('blocked_at'),
}, (t) => [index('subscribers_active_idx').on(t.isActive, t.telegramUserId)]);

export const exchangeRates = sqliteTable('exchange_rates', {
  /** Дата курса YYYY-MM-DD. */
  date: text('date').primaryKey(),
  usdIls: real('usd_ils').notNull(),
  eurIls: real('eur_ils').notNull(),
  source: text('source').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
});

export const EVENT_TYPES = [
  'app_open', 'listing_view', 'lead_form_open', 'lead_submit', 'subscribe', 'unsubscribe', 'survey_open',
] as const;

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: EVENT_TYPES }).notNull(),
  businessId: integer('business_id'),
  source: text('source', { enum: ['mini_app', 'web'] }).notNull(),
  /** Обезличенный идентификатор: хеш Telegram ID или случайного ID браузера. */
  visitorHash: text('visitor_hash').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [
  index('events_type_created_idx').on(t.type, t.createdAt),
  index('events_dedup_idx').on(t.visitorHash, t.businessId, t.type, t.createdAt),
  index('events_business_idx').on(t.businessId, t.type, t.createdAt),
]);

// ---------- Служебные таблицы (дополнение к 8 таблицам ТЗ) ----------

/** Журнал изменений лотов (раздел 8.7). */
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessId: integer('business_id').notNull(),
  adminId: integer('admin_id').notNull(),
  adminName: text('admin_name'),
  action: text('action', { enum: ['create', 'update', 'publish', 'hide', 'duplicate', 'delete'] }).notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('audit_business_idx').on(t.businessId, t.createdAt)]);

/** Задачи рассылки подписчикам (раздел 7). */
export const broadcasts = sqliteTable('broadcasts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status', { enum: ['pending', 'sending', 'done'] }).notNull().default('pending'),
  businessIds: text('business_ids', { mode: 'json' }).$type<number[]>().notNull(),
  scheduledAt: integer('scheduled_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at'),
  /** Последний обработанный telegram_user_id. */
  cursor: integer('cursor').notNull().default(0),
  delivered: integer('delivered').notNull().default(0),
  blocked: integer('blocked').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('broadcasts_status_idx').on(t.status, t.scheduledAt)]);

/** Платежи продавцов за размещение (PayPal или отмеченные администратором вручную). */
export const PAYMENT_STATUSES = ['created', 'pending', 'completed', 'failed', 'refunded'] as const;
export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  tgUserId: integer('tg_user_id'),
  provider: text('provider', { enum: ['paypal', 'manual'] }).notNull(),
  /** ID заказа PayPal (Orders API v2). */
  providerOrderId: text('provider_order_id'),
  captureId: text('capture_id'),
  status: text('status', { enum: PAYMENT_STATUSES }).notNull().default('created'),
  /** Сумма в агоротах (1 ₪ = 100). */
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('ILS'),
  /** Что оплачено: placement (размещение), valuation, audit. */
  items: text('items', { mode: 'json' }).$type<string[]>().notNull().default([]),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  checkedAt: integer('checked_at'),
  completedAt: integer('completed_at'),
}, (t) => [
  uniqueIndex('payments_order_uq').on(t.providerOrderId),
  index('payments_business_idx').on(t.businessId),
  index('payments_status_idx').on(t.status, t.createdAt),
]);

/** Запросы продавцов на изменение оплаченного/опубликованного объявления. */
export const editRequests = sqliteTable('edit_requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  businessId: integer('business_id').notNull().references(() => businesses.id),
  tgUserId: integer('tg_user_id').notNull(),
  text: text('text').notNull(),
  status: text('status', { enum: ['new', 'done', 'rejected'] }).notNull().default('new'),
  adminNote: text('admin_note'),
  handledBy: integer('handled_by'),
  handledByName: text('handled_by_name'),
  createdAt: integer('created_at').notNull(),
  handledAt: integer('handled_at'),
}, (t) => [index('edit_requests_business_idx').on(t.businessId, t.createdAt), index('edit_requests_status_idx').on(t.status)]);

/**
 * Ответы опроса при первом запуске мини-приложения (купить / продать / смотрю, пожелания).
 * Используются для подборки на главной, уведомлений «только подходящие» и подсказок менеджерам.
 */
export const SURVEY_INTENTS = ['buy', 'sell', 'browse'] as const;
export const visitorProfiles = sqliteTable('visitor_profiles', {
  telegramUserId: integer('telegram_user_id').primaryKey(),
  intent: text('intent', { enum: SURVEY_INTENTS }),
  categories: text('categories', { mode: 'json' }).$type<number[]>().notNull().default([]),
  cities: text('cities', { mode: 'json' }).$type<number[]>().notNull().default([]),
  /** Покупатель: потолок бюджета (ключ из BUDGETS в src/lib/match.ts). */
  budget: text('budget'),
  /** Продавец: когда планирует продажу. */
  timeline: text('timeline'),
  wishes: text('wishes', { mode: 'json' }).$type<string[]>().notNull().default([]),
  comment: text('comment'),
  /** Уведомлять только о лотах, подходящих под ответы. */
  notifyMatching: integer('notify_matching', { mode: 'boolean' }).notNull().default(false),
  consultRequestedAt: integer('consult_requested_at'),
  phone: text('phone'),
  username: text('username'),
  firstName: text('first_name'),
  completedAt: integer('completed_at'),
  skippedAt: integer('skipped_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('profiles_intent_idx').on(t.intent, t.completedAt), index('profiles_consult_idx').on(t.consultRequestedAt)]);

/** Небольшое хранилище служебных значений (например, дата последнего оповещения). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type City = typeof cities.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Photo = typeof businessPhotos.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Broadcast = typeof broadcasts.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type VisitorProfile = typeof visitorProfiles.$inferSelect;
export type EditRequest = typeof editRequests.$inferSelect;
