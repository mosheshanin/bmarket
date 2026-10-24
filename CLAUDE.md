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
Astro 7 (SSR) + `@astrojs/cloudflare` 14 → Cloudflare Workers (Free). React-острова (админка, форма заявки, галерея).
Tailwind 4 + цвета темы Telegram, шрифт Manrope (`@fontsource-variable/manrope`). D1 + Drizzle ORM.
Фото — Workers KV (`PHOTOS_KV`), R2 (`PHOTOS`) подключается привязкой без правки кода (`src/server/storage.ts`).
grammY для бота. Zod для входных данных.

## Структура
```
src/worker.ts            точка входа Worker: кеш страниц + cron (самонастройка бота, рассылки, курсы, обслуживание)
src/pages/               страницы и API (api/admin/[...path].ts — роутер админ-API)
src/server/              серверная логика (public, leads, broadcast, rates, cache, auth, storage, secrets, bot-setup,
                         seller + paypal — объявления продавцов и оплата, settings, admin/*)
src/bot/bot.ts           команды и кнопки бота
src/admin/               React-админка (открывается только внутри Telegram)
src/seller/              «Мои объявления» продавца (/sell): черновик, оплата PayPal, запросы на изменение
src/onboarding/          опрос при первом запуске и «Подборка для вас» (грузится только в Telegram на главной)
src/components/          Astro/React-компоненты публичной части (Splash.astro — заставка при открытии)
src/lib/                 чистые функции: форматы, slug, markdown, initData, crypto
src/db/schema.ts         схема БД; миграции — migrations/ (drizzle-kit)
seed/                    test-lots.sql + photos — локальные тесты; demo-lots.sql — 10 демо-лотов для production
                         (фото — Unsplash, ключи `unsplash:<id>:<ширина>`, см. scripts/demo-lots.mjs)
scripts/                 генератор демо-SQL, проверка размера, setup-bot (запасной вариант)
tests/                   vitest (юнит) и tests/e2e/smoke.mjs (сквозной на Worker), screens.mjs (скриншоты)
```

## Команды
```
cp .dev.vars.example .dev.vars
npm run db:migrate:local && npm run db:seed:local && bash scripts/seed-photos.sh --local
npm run build && npx astro preview --port 8787 --host 127.0.0.1
npm test                    # юнит-тесты (37)
npm run test:e2e            # 177 сквозных проверок на локальном Worker (с поддельным PayPal на :8799)
npx astro check             # типы
npm run size                # размер Worker < 3 МБ gzip (сейчас ≈0,42 МБ)
npm run db:generate         # после изменения src/db/schema.ts
NODE_PATH=$(npm root -g) node tests/e2e/screens.mjs   # скриншоты (Playwright из глобальной установки)
```

## Деплой
`git push origin main` → Cloudflare Workers Builds сам собирает и выкладывает (≈1 мин). Staging нет.
Перед push: `npm test`, `npx astro check`, сборка, e2e. Миграции D1 в production — вручную (см. `docs/STATUS.md`).
Из облачной среды ассистента нет доступа к api.telegram.org / api.cloudflare.com / *.workers.dev — не пытаться `wrangler deploy`.

## Правила
- Секреты — только `.dev.vars` (в .gitignore) и панель Cloudflare / `wrangler secret put`. Никогда в коде, коммитах и чате.
- Без `TELEGRAM_BOT_TOKEN` сайт обязан работать (см. `src/server/secrets.ts`).
- После изменения `wrangler.jsonc` — `npm run types`.
- CPU 10 мс на запрос: не подключать тяжёлые библиотеки на сервере.
- Тексты интерфейса — по-русски; цены «₪ 450 000», даты «24.10.2026», время Asia/Jerusalem (`src/lib/format.ts`).
- Публичные страницы кешируются 10 минут (ключ включает версию Worker); после изменений в админке вызывается `purgePaths`.
- После работы — обновить `docs/STATUS.md`; отступления от ТЗ — в `docs/DECISIONS.md`.
