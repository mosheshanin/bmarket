import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { settings } from '../db/schema';
import { appSecret } from './secrets';
import { siteUrl, tgApi } from './telegram';

/**
 * Самонастройка бота после деплоя (вызывается задачей раз в минуту, работает один раз на версию):
 * вебхук с секретом, команды, кнопка меню «Каталог».
 * Описание и короткое описание ставятся только если они пустые — текст, заданный владельцем
 * в BotFather (Edit Description / Edit About), не перезаписывается.
 * Отдельный скрипт с компьютера не нужен.
 */
export async function ensureBotSetup(env: Env, db: DB): Promise<boolean> {
  const site = siteUrl(env);
  if (!env.TELEGRAM_BOT_TOKEN || !site.startsWith('https://')) return false;
  const stamp = `${env.CF_VERSION_METADATA?.id ?? 'dev'}|${site}|${env.TELEGRAM_BOT_TOKEN.split(':')[0]}`;
  const [s] = await db.select().from(settings).where(eq(settings.key, 'bot_setup'));
  if (s?.value === stamp) return false;

  const api = tgApi(env);
  const name = env.PROJECT_NAME || 'BMarket';
  await api.setWebhook(`${site}/api/telegram/webhook`, {
    secret_token: await appSecret(env),
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  });
  const commands = [
    { command: 'start', description: 'Открыть каталог' },
    { command: 'sell', description: 'Разместить объявление о продаже' },
    { command: 'subscribe', description: 'Уведомления о новых бизнесах' },
    { command: 'stop', description: 'Отписаться от уведомлений' },
    { command: 'help', description: 'Как пользоваться каталогом' },
  ];
  await api.setMyCommands(commands);
  await api.setMyCommands(commands, { language_code: 'ru' });
  await api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Каталог', web_app: { url: site + '/' } } });
  if (!(await api.getMyShortDescription()).short_description) {
    await api.setMyShortDescription(`${name}: покупка и продажа бизнеса в Израиле. Каталог, заявки, уведомления о новых предложениях.`);
  }
  if (!(await api.getMyDescription()).description) {
    await api.setMyDescription(
      `${name} — покупка и продажа бизнеса в Израиле.\n\n• Кафе, магазины, салоны и многое другое\n• Показываем цену, оборот, прибыль и окупаемость\n• Заявка в один клик — менеджер свяжется с вами\n\nНажмите «Старт», чтобы открыть каталог.`,
    );
  }

  await db.insert(settings).values({ key: 'bot_setup', value: stamp }).onConflictDoUpdate({ target: settings.key, set: { value: stamp } });
  console.log('bot setup done', stamp);
  return true;
}
