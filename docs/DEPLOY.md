# Инфраструктура и эксплуатация

Как развёрнут проект и как повторить или изменить настройку. Конкретные ID — в `docs/STATUS.md`.
С 12.11.2026 production — **Vercel + Supabase**, адрес `https://market.haifa.business`. Прежняя установка
(Cloudflare Worker `bmarket`, D1, KV) оставлена резервом без cron и автосборки; её описание — в истории этого файла.

## Схема

```
GitHub mosheshanin/bmarket ──push──▶ Vercel (команда Yoggy, проект bmarket, регион fra1)
   main   → Production (market.haifa.business)        ├─ static: JS/CSS/шрифты, /brands, /demo
   другие → Preview (*.vercel.app)                     └─ функция _render (Node.js 22, Fluid): страницы и API
                                                              │
Supabase, проект bmarket (Франкфурт, eu-central-1) ◀──────────┘ Postgres через пулер (6543), Storage (бакет photos)
   └─ pg_cron + pg_net: каждую минуту → /api/cron/minute, 14:00 UTC → /api/cron/daily
Telegram ──webhook──▶ /api/telegram/webhook      Банк Израиля ◀── ежедневный запрос курса
Браузер ──▶ images.unsplash.com (стоковые фото лотов, ключи unsplash:<id>:<ширина>)
```

## Vercel

- Команда **Yoggy** (`team_NjHdwhg5TkZ0vNhZDxcsjhTx`), проект `bmarket` (`prj_3hXJSld0Aa9OgT0QEaTy6pFRuszC`).
  Коннектор Vercel этот проект не видит — действия в панели выполняются вручную или встроенным браузером.
- Сборка: Framework Astro, `npm run build`, адаптер `@astrojs/vercel` (`astro.config.mjs`), регион функций —
  `vercel.json` → `regions: ["fra1"]` (рядом с базой).
- Домен `market.haifa.business` привязан к проекту; DNS-зона `haifa.business` уже на Vercel (wildcard), записи не нужны.
- Push в `main` → production-деплой; push в другие ветки → preview (защищён Vercel Authentication).

### Переменные окружения (Project → Settings → Environment Variables)

Обычные (Production и Preview):

| Переменная | Значение / назначение |
|---|---|
| `SITE_URL` | **только Production**: `https://market.haifa.business`. В Preview не задаётся — берётся адрес деплоя, бот не перенастраивается |
| `SUPABASE_URL` | `https://knasmcepypeysxojhdai.supabase.co` |
| `PHOTOS_BUCKET` | `photos` |
| `ADMIN_TELEGRAM_IDS` | Telegram ID администраторов через запятую (`352078684,585408206`) |
| `MANAGERS_CHAT_ID` | ID группы менеджеров (`-5528365586`; бот может заменить командой `/setgroup`) |
| `TELEGRAM_BOT_USERNAME`, `TELEGRAM_APP_SHORT_NAME` | `bismarketbot`, `app` |
| `PROJECT_NAME` | `BMarket` |
| `ONLINE_PAYMENTS` | `0` — онлайн-оплата PayPal выключена (`docs/PAYMENTS.md`) |
| `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID` | `sandbox`, пусто |
| `PUBLIC_IMAGES_URL`, `TURNSTILE_SITE_KEY`, `CF_ANALYTICS_TOKEN` | пусто (фото раздаёт `/img/…`; Turnstile и аналитика — после переключения) |

Секреты (тип Sensitive, вводит владелец):
- `DATABASE_URL` — Supabase → Connect → **Transaction pooler** (порт 6543), с паролем базы. Production и Preview.
- `SUPABASE_SECRET_KEY` — Supabase → Project Settings → API Keys → Secret key (`sb_secret_…`). Production и Preview.
- `TELEGRAM_BOT_TOKEN` — только Production. Секрет вебхука выводится из него автоматически.
- `TURNSTILE_SECRET_KEY`, `TELEGRAM_WEBHOOK_SECRET` — по необходимости.

После изменения переменных нужен новый деплой (Redeploy), иначе функция видит старые значения.

## Supabase

- Организация **HBC**, проект `bmarket`, ref `knasmcepypeysxojhdai`, регион eu-central-1, Postgres 17.
  Отдельно от `haifa-catalog` (`kqzrnjjeyppkmqtwnspo`) — данные и права не смешиваются.
- Таблицы закрыты от API Supabase: RLS включён без политик, права `anon`/`authenticated` отозваны
  (миграция `0001_rls_lockdown`). Сайт подключается ролью владельца таблиц, на неё RLS не действует.
  Подсказка Security Advisor «RLS Enabled No Policy» — ожидаемая.
- Фото — закрытый бакет `photos` (webp/jpeg до 10 МБ), ключи те же, что были в KV: `lots/<лот>/<id>-1600.webp`.
  Раздаёт `/img/<ключ>`, CDN Vercel кеширует на год.

### Миграции

- Схема: `src/db/schema.ts` → `npm run db:generate` → новый файл в `migrations/`.
- Production: выполнить SQL нового файла в Supabase → SQL Editor или коннектором Supabase (`apply_migration`).
  Применённые: `init`, `rls_lockdown`, `photos_bucket_and_cron_extensions`, `pg_net_to_extensions_schema`.
- Локально: `npm run db:migrate` (журнал `drizzle.__drizzle_migrations`).
- Старые миграции D1 (SQLite) — `migrations-d1/`, только для истории.

### Задачи по расписанию (pg_cron)

Секрет вызова хранится в самой базе — `settings.cron_secret` (создан `gen_random_bytes(32)`), в Vercel его
переносить не нужно: `/api/cron/*` сверяют заголовок `Authorization: Bearer …` с этой строкой.
Задачи созданы 12.11.2026 (миграция `cron_jobs_market_haifa_business`):

```sql
SELECT cron.schedule('bmarket-minute', '* * * * *', $$
  SELECT net.http_get(
    url := 'https://market.haifa.business/api/cron/minute',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM public.settings WHERE key = 'cron_secret')),
    timeout_milliseconds := 55000)
$$);
SELECT cron.schedule('bmarket-daily', '0 14 * * *', $$
  SELECT net.http_get(
    url := 'https://market.haifa.business/api/cron/daily',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT value FROM public.settings WHERE key = 'cron_secret')),
    timeout_milliseconds := 55000)
$$);
```

Проверка: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;` и
`SELECT status_code, left(content, 200), created FROM net._http_response ORDER BY created DESC LIMIT 10;`.
Остановить: `SELECT cron.unschedule('bmarket-minute');`. Повторный запуск минутной задачи, пока идёт предыдущая,
пропускается (аренда `settings.cron_minute_lease` на 50 секунд).

## Кеш страниц

Публичные страницы (главная, город, карточка, about, privacy, sitemap, robots) помечаются `x-bm-cacheable: 1`,
`src/middleware.ts` ставит `Vercel-CDN-Cache-Control: public, max-age=600` и тег `path:<путь>`. Браузер не кеширует.
После изменений в админке `purgePaths` удаляет теги (`dangerouslyDeleteByTag`), каждый деплой начинает с пустого кеша.
Прямые правки в базе (SQL) видны через 10 минут или после деплоя. Предпросмотр (`?preview=`) мимо кеша.

## Бот

Настраивается сам (`src/server/bot-setup.ts`) при первом вызове `/api/cron/minute` после деплоя: вебхук, команды,
кнопка меню «Каталог»; описание — только если пустое. Метка — `settings.bot_setup` (`<ID деплоя>|<SITE_URL>|<id бота>`).
Работает только при заданных `TELEGRAM_BOT_TOKEN` и `SITE_URL` (https) — preview вебхук не перехватывает.
Принудительно: `DELETE FROM settings WHERE key = 'bot_setup';` — через минуту настроит заново.
В BotFather владелец задаёт вручную: описание, аватар, главное мини-приложение (URL сайта), домен Login Widget (`/setdomain`).

## Перенос данных с Cloudflare

GitHub Actions «Перенос данных Cloudflare → Supabase» (`.github/workflows/migrate-from-cloudflare.yml`):
`wrangler d1 export` → `scripts/migrate-from-d1.py` (типы из схемы Postgres, таблицы очищаются и заполняются
заново, счётчики id выставляются) → `psql`; фото — все ключи KV `bmarket-photos` → Supabase Storage.
Запуск: Actions → Run workflow (когда файл есть в `main`) или push в ветку `vercel` с `[migrate]` в сообщении.
Итог — `SELECT value FROM settings WHERE key = 'migration_report';` (строки по таблицам и число фото).
Нужны секреты репозитория `CLOUDFLARE_API_TOKEN` (Account → D1: Edit, Workers KV Storage: Read; ID аккаунта — в самом workflow),
`SUPABASE_DB_URL` (Session pooler, 5432), `SUPABASE_SECRET_KEY` — все три в **окружении GitHub `SUPABASE_DB_URL`**
(Settings → Environments), workflow указывает его в `environment:`. Ключи `cron_secret` и `bot_setup` не переносятся.

## Переключение (выполнено 12.11.2026)

1. Короткая заморозка правок в админке.
2. Финальный перенос данных (workflow выше), сверить `migration_report` с D1.
3. Vercel (Production): `SITE_URL=https://market.haifa.business`, `TELEGRAM_BOT_TOKEN` (вводит владелец).
4. Cloudflare: удалить cron-триггеры Worker `bmarket` (Settings → Triggers) и выключить Workers Builds —
   иначе рассылки уйдут дважды и Worker вернёт вебхук себе.
5. Смержить `vercel` в `main`, дождаться деплоя, создать задачи pg_cron (SQL выше).
6. Проверить: `/start` и «Каталог» в боте, Mini App, заявка до группы менеджеров, админка, фото.
7. BotFather: URL мини-приложения и `/setdomain` → `market.haifa.business` (владелец).

Откат: включить cron Worker обратно и снять задачи pg_cron (`cron.unschedule`); бот вернёт вебхук на workers.dev
при следующем запуске cron Cloudflare. Данные, введённые после переключения, переносятся вручную.

## Резервные копии

- Еженедельно: GitHub Actions «Резервная копия базы» (`pg_dump` схемы `public`), артефакт хранится 56 дней.
  Нужен секрет `SUPABASE_DB_URL`. Фото в копию не входят.
- Supabase Free делает ежедневные копии на 7 дней (Database → Backups).
- Восстановление в тестовую базу: скачать артефакт → `gunzip` → `psql "<url>" -f backup.sql`.

## Локальная разработка

```
cp .env.example .env
npm run db:local          # Postgres в .data/pg (порт 54329)
npm run db:seed           # миграции + справочники + тестовые лоты + их фото в .data/photos
npm run preview           # сборка и запуск как на Vercel: http://127.0.0.1:8787
npm run test:e2e          # 182 сквозные проверки
```

## Лимиты бесплатных тарифов

Vercel Hobby: 100 ГБ трафика и 1 млн вызовов функций в месяц, cron Vercel — не чаще раза в день (поэтому pg_cron).
Supabase Free: база 500 МБ, Storage 1 ГБ, 5 ГБ исходящего трафика; **проект засыпает после 7 дней без запросов** —
pg_cron и посетители не дают ему уснуть, но проверяйте письма Supabase.

## Чек-лист ручной проверки

- [ ] Мини-приложение открывается в Telegram на iOS, Android и Desktop; заставка и тёмная тема корректны.
- [ ] `https://t.me/bismarketbot?startapp=lot-1014` открывает нужную карточку (после включения главного мини-приложения).
- [ ] Администратор создаёт лот с 10 фото и публикует — лот сразу в каталоге.
- [ ] Заявка приходит в группу ≤ 10 с; «Взять в работу» меняет статус в админке.
- [ ] Подписчик получает уведомление о новом лоте; повторная публикация рассылку не вызывает.
- [ ] После 14:00 UTC в `exchange_rates` появляется курс за день.
- [ ] PageSpeed (мобильные) для карточки ≥ 85.
