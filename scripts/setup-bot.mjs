// Настройка бота после деплоя: вебхук, команды, кнопка меню, описание.
// Запуск (секреты — только из переменных окружения, не из чата):
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... SITE_URL=https://example.com npm run bot:setup
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const name = process.env.PROJECT_NAME ?? 'BMarket';

if (!token || !secret || !site.startsWith('https://')) {
  console.error('Нужны TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET и SITE_URL (https://…)');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET: только латиница, цифры, «_» и «-», до 256 символов');
  process.exit(1);
}

async function call(method, params) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await r.json();
  console.log(`${data.ok ? '✓' : '✗'} ${method}${data.ok ? '' : ': ' + data.description}`);
  if (!data.ok) process.exitCode = 1;
  return data;
}

await call('setWebhook', {
  url: `${site}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  drop_pending_updates: true,
});
await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Открыть каталог' },
    { command: 'subscribe', description: 'Уведомления о новых бизнесах' },
    { command: 'stop', description: 'Отписаться от уведомлений' },
    { command: 'help', description: 'Как пользоваться каталогом' },
  ],
  language_code: 'ru',
});
await call('setMyCommands', {
  commands: [
    { command: 'start', description: 'Открыть каталог' },
    { command: 'subscribe', description: 'Уведомления о новых бизнесах' },
    { command: 'stop', description: 'Отписаться' },
    { command: 'help', description: 'Справка' },
  ],
});
await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Каталог', web_app: { url: site + '/' } } });
await call('setMyShortDescription', { short_description: `${name}: готовый бизнес на продажу в Израиле. Каталог, заявки, уведомления о новых предложениях.` });
await call('setMyDescription', {
  description: `${name} — каталог готовых бизнесов на продажу в Израиле.\n\n• Кафе, магазины, салоны, производство и услуги\n• Цена, оборот, прибыль и окупаемость\n• Заявка в один клик — менеджер свяжется с вами\n\nНажмите «Старт», чтобы открыть каталог.`,
});
const info = await call('getWebhookInfo', {});
console.log(info.result);
