# Запуск в Cloudflare и Telegram

Пошагово, от пустого аккаунта до работающего каталога. Всё на бесплатных тарифах. Секреты никуда не вставляйте, кроме команд `wrangler secret put` и панели Cloudflare.

## 0. Что понадобится
- Node.js 20+ на компьютере, `git`.
- Аккаунт Cloudflare (Free) и доступ к этому репозиторию на GitHub.
- Telegram на телефоне.

```bash
git clone https://github.com/mosheshanin/bmarket && cd bmarket
npm ci
npx wrangler login
```

## 1. Ресурсы Cloudflare
```bash
# Базы D1 (регион «Западная Европа»)
npx wrangler d1 create catalog-prod --location weur
npx wrangler d1 create catalog-staging --location weur
# Бакеты R2: фото (prod/staging) и закрытый — для резервных копий
npx wrangler r2 bucket create bmarket-photos
npx wrangler r2 bucket create bmarket-photos-staging
npx wrangler r2 bucket create bmarket-backups
```
Вставьте выданные `database_id` в `wrangler.jsonc` (в корень — prod, в `env.staging` — staging) и закоммитьте.

Примените миграции (создают таблицы, города, отрасли, стартовый курс):
```bash
npm run db:migrate:staging
npm run db:migrate:prod
# только для staging — тестовые лоты с фото:
npm run db:seed:staging && bash scripts/seed-photos.sh --remote --env staging
```

## 2. Боты и группа менеджеров
1. В [@BotFather](https://t.me/BotFather): `/newbot` — рабочий бот, ещё раз — тестовый (для staging).
2. `/newapp` для каждого бота → короткое имя приложения, например `app`. URL — адрес сайта (`https://<домен>/`).
3. Создайте закрытую группу «Менеджеры», добавьте обоих администраторов и рабочего бота.
4. Узнайте ID группы (например, через [@getidsbot](https://t.me/getidsbot) — отрицательное число вида `-100…`) и Telegram ID обоих администраторов.

## 3. Переменные и секреты
В `wrangler.jsonc` → `vars` (и в `env.staging.vars` — значения для тестового бота):

| Переменная | Пример |
|---|---|
| `SITE_URL` | `https://bmarket.example.com` (на старте — адрес `*.workers.dev`) |
| `PUBLIC_IMAGES_URL` | `https://img.bmarket.example.com` (пусто — фото раздаёт сам Worker по `/img/…`) |
| `ADMIN_TELEGRAM_IDS` | `111111111,222222222` |
| `MANAGERS_CHAT_ID` | `-1001234567890` |
| `TELEGRAM_BOT_USERNAME` | `bmarket_bot` (без @) |
| `TELEGRAM_APP_SHORT_NAME` | `app` |
| `TURNSTILE_SITE_KEY` | ключ сайта Turnstile |
| `CF_ANALYTICS_TOKEN` | токен Cloudflare Web Analytics |
| `PROJECT_NAME` | название бренда |

Секреты (для staging добавьте `--env staging`):
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # любая строка: латиница/цифры/_/-, 32+ символа
npx wrangler secret put TURNSTILE_SECRET_KEY
```

## 4. Деплой
Вручную: `npm run deploy` (prod) и `npm run deploy:staging`.

Автоматически (Workers Builds): Cloudflare → Workers & Pages → Create → Import a repository → `mosheshanin/bmarket`.
- Prod-Worker `bmarket`: ветка `main`, build command `npm run build`, deploy command `npx wrangler deploy`.
- Staging-Worker `bmarket-staging`: ветка `staging`, build command `CLOUDFLARE_ENV=staging npm run build`, deploy command `npx wrangler deploy --env staging`.

Проверка размера: `npm run size` (должно быть меньше 3 МБ gzip; сейчас ≈ 0,4 МБ).

## 5. Настройка бота
```bash
TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… SITE_URL=https://… npm run bot:setup
```
Скрипт ставит вебхук с секретом, команды, кнопку меню «Каталог» и описание бота.

## 6. Домен
1. Купите домен (`.com` — прямо в Cloudflare Registrar; `.co.il` — у израильского регистратора, затем перенесите NS в Cloudflare).
2. Worker `bmarket` → Settings → Domains & Routes → Add Custom Domain → `example.com`.
3. Бакет `bmarket-photos` → Settings → Custom Domains → `img.example.com`; пропишите его в `PUBLIC_IMAGES_URL`.
4. Обновите `SITE_URL`, задеплойте и повторите шаг 5 (новый адрес вебхука и мини-приложения в BotFather).

Кеш страниц (Cache API) работает только на собственном домене; на `*.workers.dev` страницы отдаются без кеша — это нормально.

## 7. Turnstile и аналитика
- Cloudflare → Turnstile → Add widget, домен сайта, режим Managed → `TURNSTILE_SITE_KEY` (vars) и `TURNSTILE_SECRET_KEY` (secret).
- Cloudflare → Web Analytics → Add site → токен в `CF_ANALYTICS_TOKEN`.
- Notifications → включите уведомления о приближении к лимитам Workers/D1.

## 8. Резервные копии
1. Cloudflare → My Profile → API Tokens → Create Token: права **D1 Edit** и **Workers R2 Storage Edit** на ваш аккаунт.
2. GitHub → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
3. Удаление копий старше 8 недель:
   ```bash
   npx wrangler r2 bucket lifecycle add bmarket-backups expire-old d1/ --expire-days 56
   ```
4. Проверка: GitHub → Actions → «Резервная копия D1» → Run workflow. Восстановление в тестовую базу:
   ```bash
   npx wrangler r2 object get bmarket-backups/d1/catalog-prod-YYYY-MM-DD.sql.gz --file b.sql.gz --remote && gunzip b.sql.gz
   npx wrangler d1 execute catalog-staging --remote --env staging --file b.sql
   ```
Плюс D1 Time Travel: `npx wrangler d1 time-travel restore catalog-prod --timestamp=<время>` (7 дней).

## 9. После запуска
- Google Search Console → добавить домен → отправить `https://<домен>/sitemap.xml`.
- Согласовать тексты `/privacy` и `/about` с израильским юристом (раздел 12.3 ТЗ).
- Наполнить 10 лотов через админ-панель (кнопка «Админ-панель» появляется у администраторов в мини-приложении).

## Чек-лист ручной проверки (раздел 14.2)
- [ ] Мини-приложение открывается в Telegram на iOS, Android и Desktop; тёмная тема корректна.
- [ ] Ссылка `https://t.me/<бот>/app?startapp=lot-1001` открывает нужную карточку.
- [ ] Администратор с телефона создаёт лот с 10 фото, публикует — лот сразу в каталоге.
- [ ] Заявка приходит в группу менеджеров ≤ 10 с; «Взять в работу» меняет статус в админке.
- [ ] Подписчик получает уведомление о новом лоте с фото и кнопкой; повторная публикация рассылку не вызывает.
- [ ] В таблице `exchange_rates` появляется запись за день (после 14:00 UTC).
- [ ] PageSpeed (мобильные) для карточки ≥ 85.
- [ ] Резервная копия восстанавливается в тестовую базу.
