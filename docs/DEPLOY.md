# Инфраструктура и эксплуатация

Как сейчас развёрнут проект и как повторить или изменить настройку. Конкретные ID — в `docs/STATUS.md`.

## Схема

```
GitHub mosheshanin/bmarket (main) ──push──▶ Cloudflare Workers Builds ──▶ Worker «bmarket»
                                                                         ├─ D1 catalog-prod (данные)
                                                                         ├─ KV bmarket-photos (фото)
                                                                         ├─ static assets (JS/CSS/шрифты, значки /brands)
                                                                         ├─ cron * * * * *  — самонастройка бота, рассылки
                                                                         └─ cron 0 14 * * * — курс Банка Израиля, обслуживание
Telegram ──webhook──▶ /api/telegram/webhook      Банк Израиля ◀── ежедневный запрос курса
Браузер ──▶ images.unsplash.com (стоковые фото лотов, ключи unsplash:<id>:<ширина>)
```

## Workers Builds (автодеплой)

Cloudflare → Workers & Pages → `bmarket` → Settings → Build:
- репозиторий `mosheshanin/bmarket`, ветка `main`, корень `/`;
- build command `npm run build`, deploy command `npx wrangler deploy`;
- Preview builds выключены.

Доступ Cloudflare к репозиторию: GitHub → Settings → Applications → «Cloudflare Workers and Pages» → Configure
(выбраны `milav` и `bmarket`).

## Переменные и секреты

`vars` в `wrangler.jsonc` (перезаписываются при каждом деплое):

| Переменная | Значение / назначение |
|---|---|
| `SITE_URL` | `https://bmarket.moshemadwords.workers.dev` — канонические адреса, кнопки бота, вебхук |
| `PUBLIC_IMAGES_URL` | пусто — фото раздаёт Worker по `/img/…` |
| `ADMIN_TELEGRAM_IDS` | Telegram ID администраторов через запятую (сейчас `352078684,585408206`) |
| `MANAGERS_CHAT_ID` | ID группы менеджеров |
| `TELEGRAM_BOT_USERNAME`, `TELEGRAM_APP_SHORT_NAME` | `bismarketbot`, `app` — для ссылок `t.me/<бот>/<app>?startapp=…` |
| `TURNSTILE_SITE_KEY`, `CF_ANALYTICS_TOKEN` | пусто, заполнить после домена |
| `PROJECT_NAME` | название бренда |
| `ONLINE_PAYMENTS` | `"0"` — онлайн-оплата PayPal выключена (`docs/PAYMENTS.md`) |
| `PAYPAL_ENV`, `PAYPAL_WEBHOOK_ID` | `sandbox`, пусто — для PayPal, когда понадобится |

Секреты (панель Worker → Settings → Variables and Secrets, тип Secret):
- `TELEGRAM_BOT_TOKEN` — обязательный. Секрет вебхука выводится из него автоматически.
- `TURNSTILE_SECRET_KEY` — после подключения Turnstile.
- `TELEGRAM_WEBHOOK_SECRET` — необязательный, если нужен свой секрет вебхука.

## База D1

- Схема: `src/db/schema.ts` → `npm run db:generate` → новый файл в `migrations/`.
- Production: выполнить SQL нового файла в Cloudflare → D1 → `catalog-prod` → Console (или коннектором),
  затем `INSERT INTO d1_migrations (name) VALUES ('<файл>.sql');`.
- Time Travel (7 дней): Cloudflare → D1 → catalog-prod → Time Travel.
- Коннектор Cloudflare принимает SQL-пакеты до ≈11 КБ — большие файлы выполнять частями.
- Импорт объявлений: `node --experimental-strip-types scripts/import-israel-2026-10.mjs` → `seed/israel-listings-2026-10.sql`
  (города, лоты, стоковые фото, публикация и одна рассылка). Повторный запуск безопасен. Перед production —
  проверить локально: заменить номера лотов на временные, выполнить `wrangler d1 execute DB --local --file …`, посмотреть, удалить.
- Демо-объявления (сейчас удалены): `scripts/demo-lots.mjs` → `seed/demo-lots.sql`.

## Бот

Настраивается сам (см. `src/server/bot-setup.ts`): вебхук, команды, кнопка меню «Каталог» — после каждого деплоя;
описание и короткое описание — только если они пустые (текст из BotFather не перезаписывается).
Чтобы принудительно перенастроить — `DELETE FROM settings WHERE key = 'bot_setup';` в D1: через минуту cron настроит заново.

В BotFather владелец задаёт вручную: описание (Edit Description), «О боте» (Edit About), картинку описания
(GIF/MP4 320×180 или картинка 640×360), аватар, главное мини-приложение (Bot Settings → Configure Mini App —
кнопка «Открыть» в списке чатов и ссылки `t.me/bismarketbot?startapp=…`).
Запасной путь с компьютера: `TELEGRAM_BOT_TOKEN=… SITE_URL=… npm run bot:setup` (+ `TELEGRAM_WEBHOOK_SECRET`, если задан).

## Домен (когда появится)

1. Купить домен (`.com` — Cloudflare Registrar; `.co.il` — израильский регистратор, NS → Cloudflare).
2. Worker `bmarket` → Settings → Domains & Routes → Add → Custom Domain.
3. В `wrangler.jsonc` поменять `SITE_URL`, push. Бот перенастроится сам; в @BotFather обновить URL мини-приложения.
4. Включить Turnstile (Managed) и Web Analytics для домена, заполнить ключи.
5. Google Search Console → домен → `https://<домен>/sitemap.xml`.

Кеш страниц — Cache API, 10 минут, ключ включает версию Worker. Прямые правки в D1 (коннектором) видны после следующего деплоя или через 10 минут.

## Резервные копии

- Еженедельно: GitHub Actions «Резервная копия D1» выгружает базу и хранит артефакт 56 дней.
  Нужны секреты репозитория `CLOUDFLARE_API_TOKEN` (права D1 Edit) и `CLOUDFLARE_ACCOUNT_ID`.
- Восстановление в тестовую базу: скачать артефакт → `gunzip` → `wrangler d1 execute <база> --remote --file backup.sql`.

## Лимиты бесплатного тарифа

Workers: 100 000 запросов/день, 10 мс CPU. D1: 5 млн чтений и 100 000 записей в день, 500 МБ.
KV: 100 000 чтений и **1 000 записей в день** (одно фото = 2 записи), 1 ГБ.
Включите в Cloudflare → Notifications оповещения о приближении к лимитам.

## Чек-лист ручной проверки

- [ ] Мини-приложение открывается в Telegram на iOS, Android и Desktop; заставка и тёмная тема корректны.
- [ ] `https://t.me/bismarketbot?startapp=lot-1014` открывает нужную карточку (после включения главного мини-приложения).
- [ ] Администратор создаёт лот с 10 фото и публикует — лот сразу в каталоге.
- [ ] Заявка приходит в группу ≤ 10 с; «Взять в работу» меняет статус в админке.
- [ ] Подписчик получает уведомление о новом лоте; повторная публикация рассылку не вызывает.
- [ ] После 14:00 UTC в `exchange_rates` появляется курс за день.
- [ ] PageSpeed (мобильные) для карточки ≥ 85.
