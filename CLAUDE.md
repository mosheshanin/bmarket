# BMarket — правила для ИИ-ассистента

Каталог израильских бизнесов на продажу: Telegram Mini App + сайт. **Единственный источник правды — `docs/SPEC.md`.**
Отступления от ТЗ фиксируются в `docs/DECISIONS.md`.

## Главное правило безопасности
Скрытые поля лота (`real_name`, `exact_address`, `owner_*`, `internal_notes`, служебные) **никогда** не попадают
в публичный HTML, публичное API, карту сайта, сообщения в Telegram-группу и рассылки.
- Публичные данные читаются только через `src/server/public.ts` (`PUBLIC_BUSINESS_COLUMNS` — явный список).
- Новое поле в `businesses` нужно явно добавить в `PUBLIC_BUSINESS_COLUMNS` или `HIDDEN_BUSINESS_FIELDS` — иначе упадёт `tests/hidden-fields.test.ts`.
- Любой `/api/admin/*` проходит через `requireAdmin` (подпись initData + `ADMIN_TELEGRAM_IDS`).

## Стек
Astro 7 (SSR) + `@astrojs/cloudflare` 14 → Cloudflare Workers (Free). React-острова (админка, форма заявки, галерея).
Tailwind 4 + цвета темы Telegram. D1 + Drizzle ORM. R2 для фото. grammY для бота. Zod для входных данных.

## Структура
```
src/worker.ts            точка входа Worker: кеш страниц + cron (рассылки, курсы, обслуживание)
src/pages/               страницы и API (api/admin/[...path].ts — роутер админ-API)
src/server/              серверная логика (public, leads, broadcast, rates, cache, auth, admin/*)
src/bot/bot.ts           команды и кнопки бота
src/admin/               React-админка (открывается только внутри Telegram)
src/components/          Astro/React-компоненты публичной части
src/lib/                 чистые функции: форматы, slug, markdown, initData, crypto
src/db/schema.ts         схема БД; миграции — migrations/ (drizzle-kit)
seed/                    тестовые лоты и фото (только локально/staging)
tests/                   vitest (юнит) и tests/e2e/smoke.mjs (сквозной на Worker)
```

## Команды
```
npm run dev                 # разработка (workerd через Vite)
npm run build && npm run size
npm test                    # юнит-тесты
npm run db:migrate:local && npm run db:seed:local && bash scripts/seed-photos.sh --local
npx astro preview --port 8787 --host 127.0.0.1   # затем:
npm run test:e2e            # 96 сквозных проверок
npx astro check             # типы
npm run db:generate         # после изменения src/db/schema.ts
```

## Правила
- Секреты — только `.dev.vars` (в .gitignore) и `wrangler secret put`. Никогда в коде и в чате.
- После изменения `wrangler.jsonc` — `npm run types`.
- Размер Worker < 3 МБ gzip (`npm run size`), CPU 10 мс: не подключать тяжёлые библиотеки на сервере.
- Тексты интерфейса — по-русски; цены «₪ 450 000», даты «24.10.2026», время Asia/Jerusalem (`src/lib/format.ts`).
- Публичные страницы кешируются 10 минут; после изменений в админке вызывается `purgePaths`.
- Этап = коммит → проверка на staging → слияние в `main`.
