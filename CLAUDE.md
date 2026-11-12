# BMarket — правила для ИИ-ассистента

Каталог израильских бизнесов на продажу: Telegram Mini App + сайт. **ТЗ — `docs/SPEC.md`** (источник правды).
Текущее состояние, адреса, ID и список дел — **`docs/STATUS.md`** (читать первым). Отступления от ТЗ — `docs/DECISIONS.md`.
Оплата размещения продавцами (PayPal) — `docs/PAYMENTS.md`.
Общение с владельцем — на русском.

## Главное правило безопасности
Скрытые поля лота (`real_name`, `exact_address`, `owner_*`, `internal_notes`, служебные) **никогда** не попадают
в публичный HTML, публичное API, карту сайта, сообщения в Telegram-группу и рассылки.
- Публичные данные читаются только через `src/server/public.ts` (`PUBLIC_BUSINESS_COLUMNS` — явный список).
- Новое поле в `businesses` нужно явно добавить в `PUBLIC_BUSINESS_COLUMNS` или `HIDDEN_BUSINESS_FIELDS` — иначе упадёт `tests/hidden-fields.test.ts`.
- Любой `/api/admin/*` проходит через `requireAdmin` (подпись initData + `ADMIN_TELEGRAM_IDS`).
- `/api/seller/*` — подпись initData; продавец видит и меняет только свои объявления (`seller_tg_id`), и только до отправки.

## Стек
Astro 7 (SSR) + `@astrojs/vercel` → Vercel Functions (Node.js, регион fra1, Hobby). React-острова (админка, форма заявки, галерея).
Tailwind 4 + цвета темы Telegram, шрифт Nunito (`@fontsource-variable/nunito`, округлый).
Supabase: Postgres 17 + Drizzle ORM (`postgres.js` через пулер 6543), фото — Supabase Storage (бакет `photos`, `src/server/storage.ts`).
Задачи по расписанию — Supabase pg_cron → `/api/cron/minute` и `/api/cron/daily` (`src/server/jobs.ts`).
grammY для бота. Zod для входных данных. Переезд с Cloudflare Workers/D1/KV — ноябрь 2026, `docs/DEPLOY.md`.

## Структура
```
src/middleware.ts        соль хешей + заголовки кеша CDN для публичных страниц
src/pages/               страницы и API (api/admin/[...path].ts — роутер админ-API, api/cron/* — задачи по расписанию)
src/server/              серверная логика (env — переменные окружения, jobs — cron, public, leads, broadcast, rates, cache, auth, storage, secrets, bot-setup,
                         seller + paypal — объявления продавцов и оплата, settings, admin/*)
src/bot/bot.ts           команды и кнопки бота
src/admin/               React-админка (открывается только внутри Telegram)
src/seller/              «Мои объявления» продавца (/sell): черновик, заявка на размещение (PayPal выключен), промо-блок, запросы на изменение
src/onboarding/          опрос при первом запуске и «Подборка для вас» (грузится только в Telegram на главной)
src/components/          Astro/React-компоненты публичной части (Splash.astro — заставка при открытии)
src/lib/                 чистые функции: форматы, slug, markdown, initData, crypto; extras (платные услуги), promo
src/db/schema.ts         схема БД (pg-core); миграции Postgres — migrations/ (drizzle-kit), старые D1 — migrations-d1/
seed/                    dictionaries.sql, test-lots.sql + photos — локальные тесты; haifa-*/israel-* — импорт реальных объявлений (SQLite, исторические)
                         в production (фото — Unsplash, ключи `unsplash:<id>:<ширина>`, на сайте «Фото для иллюстрации»)
scripts/                 local-pg.sh, db-migrate.mjs, serve-local.mjs (локальный запуск как на Vercel), migrate-from-d1.py (перенос с D1),
                         генераторы импорта (import-*-2026-10.mjs), демо-SQL, setup-bot
public/brands/           значки Facebook/Google/Яндекса для промо-блока продавца (источники — docs/BRAND-ASSETS.md)
tests/                   vitest (юнит) и tests/e2e/smoke.mjs (сквозной на локальной сборке + Postgres), screens.mjs (скриншоты)
```

## Команды
```
cp .env.example .env
npm run db:local && npm run db:seed      # локальный Postgres (.data/pg, порт 54329) + тестовые лоты и фото
npm run preview             # сборка и запуск как на Vercel: http://127.0.0.1:8787
npm test                    # юнит-тесты (37)
npm run test:e2e            # 182 сквозных проверки на локальной сборке (с поддельным PayPal на :8799)
npx astro check             # типы
npm run db:generate         # после изменения src/db/schema.ts
NODE_PATH=$(npm root -g) node tests/e2e/screens.mjs   # скриншоты (Playwright из глобальной установки)
```

## Деплой
`git push origin main` → Vercel собирает и выкладывает production (https://market.haifa.business, ≈1 мин);
другие ветки → preview (`*.vercel.app`, без `SITE_URL` и токена бота). С 12.11.2026 Cloudflare Worker — только резерв.
Перед push: `npm test`, `npx astro check`, сборка, e2e. Миграции в production (Supabase) — вручную, коннектором Supabase.
Из облачной среды ассистента нет доступа к api.telegram.org, api.cloudflare.com, *.supabase.co (кроме коннектора) —
деплой только через `git push`. Коннектор Vercel не видит проект bmarket — панель Vercel через встроенный браузер.

## Правила
- Секреты — только `.env` (в .gitignore), панель Vercel и секреты GitHub. Никогда в коде, коммитах и чате. Вводит владелец.
- Без `TELEGRAM_BOT_TOKEN` сайт обязан работать (см. `src/server/secrets.ts`).
- Новые переменные окружения — в `interface Env` (`src/env.d.ts`) и `docs/DEPLOY.md`.
- Таблицы Supabase закрыты от публичного API (RLS без политик): новая таблица — тоже `ENABLE ROW LEVEL SECURITY`.
- Postgres: `count(*)`/`sum()` приходят числами (парсер в `src/db/client.ts`); при `ORDER BY` по nullable-колонке указывать `nulls first/last`.
- Тексты интерфейса — по-русски; цены «₪ 450 000», даты «24.10.2026», время Asia/Jerusalem (`src/lib/format.ts`).
- Публичные страницы кешируются в CDN Vercel 10 минут (тег `path:<путь>`); после изменений в админке вызывается `purgePaths`.
- После работы — обновить `docs/STATUS.md`; отступления от ТЗ — в `docs/DECISIONS.md`.
