# Состояние проекта и передача в новую сессию

Обновлено: 24.10.2026. Этот файл — первое, что нужно прочитать в новой сессии (вместе с `CLAUDE.md`).

## Коротко

Каталог израильских бизнесов на продажу работает в production: сайт + Telegram Mini App + бот.
Всё из ТЗ (`docs/SPEC.md`, этапы 1–9) реализовано в коде; отступления — `docs/DECISIONS.md`.

| Что | Значение |
|---|---|
| Сайт / мини-приложение | https://bmarket.moshemadwords.workers.dev |
| Бот | [@bismarketbot](https://t.me/bismarketbot) |
| Репозиторий | `mosheshanin/bmarket` (приватный), ветка `main` = production |
| Cloudflare аккаунт | `25497a10c7db07870fa29504e0f464a4` (moshemadwords@gmail.com) |
| Worker | `bmarket` (Workers Free), автодеплой Workers Builds из `main` |
| D1 | `catalog-prod`, id `203711a2-331e-4498-9572-514182e7623e`, регион WEUR |
| Фото | Workers KV `bmarket-photos`, id `a173fe0067944711b424d830b5905315` (R2 не включён — нужна карта) |
| Администратор | Telegram ID `352078684` (переменная `ADMIN_TELEGRAM_IDS`) |
| Группа менеджеров | `-5528365586` (переменная `MANAGERS_CHAT_ID`) |
| Секрет | `TELEGRAM_BOT_TOKEN` — задан в панели Cloudflare (Worker → Settings → Variables and Secrets) |

## Как устроен деплой

- `git push` в `main` → Cloudflare Workers Builds: `npm ci` → `npm run build` → `npx wrangler deploy` (≈1 минута).
  Токен сборки — «milav build token». Preview-сборки выключены.
- Переменные (не секреты) — в `wrangler.jsonc` → `vars`; при деплое они перезаписывают значения в панели.
- После каждого деплоя задача cron (раз в минуту) сама настраивает бота: вебхук с секретом, команды, кнопку меню «Каталог»,
  описание. Отметка — строка `settings.bot_setup` в D1 (`<id версии>|<SITE_URL>|<id бота>`).
- Миграции D1 в production применяются вручную (Cloudflare → D1 → catalog-prod → Console, или коннектор Cloudflare,
  или `wrangler d1 migrations apply catalog-prod --remote` с API-токеном). После ручного применения добавьте имя файла
  в таблицу `d1_migrations`, чтобы wrangler не применил его повторно.

## Ограничения среды ИИ-ассистента (важно для новой сессии)

- Из облачной среды Claude **нет сетевого доступа** к `api.telegram.org`, `api.cloudflare.com` и `*.workers.dev`:
  `wrangler deploy`/`wrangler secret` оттуда не работают. Деплой — только через `git push`.
- Коннектор Cloudflare умеет: D1 (создать, SQL-запросы), KV/R2 (создать), список Workers. Не умеет: загружать код, задавать секреты, писать в KV.
- Сайт и панель Cloudflare можно открывать во встроенном браузере (при связке с компьютером владельца).
- Секреты и пароли вводит владелец сам.

## Что сделано (24.10.2026)

- [x] Весь функционал ТЗ: каталог, карточки, заявки, админ-панель в Telegram, рассылки, курсы валют, SEO, статистика.
- [x] Шрифт Manrope, заставка «Сторис» при каждом открытии мини-приложения (`src/components/Splash.astro`).
- [x] Production-база заполнена: 20 городов, 14 отраслей, стартовый курс.
- [x] Worker задеплоен, токен бота задан, бот самонастроился (вебхук, команды, кнопка меню).
- [x] 10 демонстрационных объявлений (лоты 1001–1010, `seed/demo-lots.sql`). Фото — иллюстрации в `public/demo/lots/`.
- [x] Обложка мини-приложения 640×360 для @BotFather (передана владельцу).
- [x] Тесты: 28 юнит-тестов, 96 сквозных проверок (`npm test`, `npm run test:e2e`).

## Что осталось (по приоритету)

1. **Проверить в Telegram вживую**: открыть @bismarketbot → «Каталог» → «Админ-панель», создать лот с фото,
   оставить тестовую заявку → проверить, что она пришла в группу и кнопка «Взять в работу» работает.
   Бот должен быть участником группы `-5528365586`.
2. **@BotFather → `/newapp`**: бот @bismarketbot, короткое имя `app`, URL `https://bmarket.moshemadwords.workers.dev/`,
   обложка 640×360. Нужно для прямых ссылок `t.me/bismarketbot/app?startapp=lot-1001`.
3. **Перевыпустить токен бота** (`/revoke` в @BotFather) — он был в чате; затем обновить секрет `TELEGRAM_BOT_TOKEN`
   в панели. Вебхук перенастроится сам в течение минуты.
4. **Демо-объявления** перед реальным запуском снять с публикации (в админке «Снять») — они помечены
   в скрытых заметках «ДЕМО». Удалить совсем можно SQL-запросом (см. `seed/demo-lots.sql`, первые строки).
5. Название бренда (сейчас `PROJECT_NAME = BMarket`), домен → Custom Domain в Cloudflare, затем обновить `SITE_URL`.
6. Turnstile (ключи `TURNSTILE_SITE_KEY` / секрет `TURNSTILE_SECRET_KEY`) — после домена.
7. Cloudflare Web Analytics (`CF_ANALYTICS_TOKEN`), Google Search Console + sitemap.
8. Резервные копии: в GitHub → Settings → Secrets → Actions добавить `CLOUDFLARE_API_TOKEN` (права D1 Edit)
   и `CLOUDFLARE_ACCOUNT_ID`; проверить workflow «Резервная копия D1».
9. Текст `/privacy` согласовать с израильским юристом.
10. По желанию: включить R2 (нужна карта) и добавить привязку `PHOTOS` — фото пойдут в R2 без изменения кода.

## Шаблон запроса для новой сессии

```
Репозиторий mosheshanin/bmarket. Прочитай CLAUDE.md, docs/STATUS.md, docs/SPEC.md и docs/DECISIONS.md.
Задача: <что сделать>.
Сначала предложи план (какие файлы изменишь, что нужно от меня), после «ок» — реализуй,
прогони npm test, npx astro check, сборку и e2e локально, затем закоммить и запушь в main.
В конце обнови docs/STATUS.md.
```
