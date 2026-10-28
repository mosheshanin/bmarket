import { Bot, InlineKeyboard, type Context } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client';
import { businesses } from '../db/schema';
import { businessPath } from '../lib/slug';
import { escapeHtml, formatIls } from '../lib/format';
import { displayName, isAdminId } from '../server/auth';
import { syncLeadMessage, takeLead } from '../server/leads';
import { isSubscribed, subscribe, unsubscribe } from '../server/subscriptions';
import { MANAGERS_CHAT_KEY, MANAGERS_ERROR_KEY, getManagersChat, siteUrl } from '../server/telegram';
import { deleteSetting, setSetting } from '../server/settings';

/** botInfo без запроса getMe на каждом холодном старте. */
function botInfo(env: Env): UserFromGetMe {
  const id = Number(env.TELEGRAM_BOT_TOKEN.split(':')[0]) || 0;
  return {
    id,
    is_bot: true,
    first_name: env.PROJECT_NAME || 'Bot',
    username: env.TELEGRAM_BOT_USERNAME || 'bot',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: true,
  } as UserFromGetMe;
}

function webAppButton(env: Env, kb: InlineKeyboard, text: string, path = '/'): InlineKeyboard {
  const url = siteUrl(env) + path;
  return url.startsWith('https://') ? kb.webApp(text, url) : kb.url(text, url);
}

const HELP = [
  '<b>Как пользоваться каталогом</b>',
  '',
  '• Нажмите «Открыть каталог» или кнопку меню слева от поля ввода.',
  '• Выберите город и откройте интересный бизнес.',
  '• Нажмите «Узнать подробнее» и оставьте заявку — менеджер свяжется с вами в течение рабочего дня и расскажет название и адрес.',
  '',
  'Команды:',
  '/sell — разместить объявление о продаже своего бизнеса',
  '/subscribe — получать уведомления о новых бизнесах',
  '/stop — отписаться от уведомлений',
  '/help — эта справка',
].join('\n');

export function createBot(env: Env, db: DB): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN, { botInfo: botInfo(env) });
  // Ошибка в обработчике не должна давать 500: иначе Telegram будет бесконечно повторять апдейт.
  const safe = bot.errorBoundary((err) => console.error('bot handler error', err.error));
  const pm = safe.chatType('private');

  async function welcome(ctx: Context) {
    const subscribed = ctx.from ? await isSubscribed(db, ctx.from.id) : false;
    const kb = webAppButton(env, new InlineKeyboard(), 'Открыть каталог').row();
    webAppButton(env, kb, 'Продать свой бизнес', '/sell').row();
    if (!subscribed) kb.text('Подписаться на новые бизнесы', 'sub');
    await ctx.reply(
      `Здравствуйте! Это каталог готовых бизнесов на продажу в Израиле.\n\nСмотрите объявления, оставляйте заявки — менеджер свяжется с вами.${subscribed ? '\n\nВы подписаны на уведомления о новых бизнесах.' : ''}`,
      { reply_markup: kb },
    );
  }

  pm.command('start', async (ctx) => {
    const payload = (ctx.match ?? '').trim();
    const lot = /^lot-(\d+)$/.exec(payload);
    if (lot) {
      const [b] = await db
        .select({ lotNumber: businesses.lotNumber, slug: businesses.slug, title: businesses.publicTitle, price: businesses.priceIls, status: businesses.status })
        .from(businesses)
        .where(eq(businesses.lotNumber, Number(lot[1])));
      if (b && b.status === 'published') {
        const kb = webAppButton(env, new InlineKeyboard(), 'Открыть объявление', businessPath(b.lotNumber, b.slug));
        await ctx.reply(`Лот №${b.lotNumber} — ${escapeHtml(b.title)}${b.price ? `\n${formatIls(b.price)}` : ''}`, {
          parse_mode: 'HTML',
          reply_markup: kb,
        });
        return;
      }
    }
    // Ссылка «Открыть в админке» из группы менеджеров: администратору — кнопка в админку, остальным — приветствие.
    const adm = /^(biz|lead)-(\d+)$/.exec(payload);
    if (adm && isAdminId(env, ctx.from?.id)) {
      const id = Number(adm[2]);
      const path = adm[1] === 'biz' ? `/admin#/listings/${id}` : `/admin#/leads/${id}`;
      let head = adm[1] === 'lead' ? `Заявка №${id}` : 'Объявление';
      if (adm[1] === 'biz') {
        const [b] = await db.select({ lotNumber: businesses.lotNumber, title: businesses.publicTitle }).from(businesses).where(eq(businesses.id, id));
        if (b) head = `Объявление №${b.lotNumber}${b.title ? ` — ${escapeHtml(b.title)}` : ''}`;
      }
      await ctx.reply(head, { parse_mode: 'HTML', reply_markup: webAppButton(env, new InlineKeyboard(), 'Открыть в админке', path) });
      return;
    }
    const sell = /^sell(?:-(\d+))?$/.exec(payload);
    if (sell) {
      await sellReply(ctx, sell[1] ? `/sell?b=${sell[1]}` : '/sell');
      return;
    }
    if (payload === 'subscribe' && ctx.from) {
      await subscribe(db, ctx.from);
      await ctx.reply('Готово! Пришлём сообщение, когда в каталоге появится новый бизнес. Отписаться — /stop.');
      return;
    }
    await welcome(ctx);
  });

  async function sellReply(ctx: Context, path = '/sell') {
    await ctx.reply(
      'Продаёте бизнес? Заполните объявление — черновик сохраняется автоматически, вернуться к нему можно в любой момент.\n\nПосле отправки и оплаты объявление появится в каталоге. Изменения после публикации — через запрос администратору.',
      { reply_markup: webAppButton(env, new InlineKeyboard(), 'Мои объявления', path) },
    );
  }
  pm.command('sell', (ctx) => sellReply(ctx));

  pm.command('subscribe', async (ctx) => {
    const created = await subscribe(db, ctx.from);
    await ctx.reply(created ? 'Вы подписались на уведомления о новых бизнесах. Отписаться — /stop.' : 'Вы уже подписаны. Отписаться — /stop.');
  });

  pm.command('stop', async (ctx) => {
    await unsubscribe(db, ctx.from.id);
    await ctx.reply('Вы отписались от уведомлений. Подписаться снова — /subscribe.');
  });

  pm.command('help', (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));

  safe.callbackQuery('sub', async (ctx) => {
    await subscribe(db, ctx.from);
    await ctx.answerCallbackQuery({ text: 'Вы подписаны на новые бизнесы' });
    await ctx.editMessageReplyMarkup({ reply_markup: webAppButton(env, new InlineKeyboard(), 'Открыть каталог') }).catch(() => {});
  });

  safe.callbackQuery('unsub', async (ctx) => {
    await unsubscribe(db, ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Вы отписались от уведомлений' });
    await ctx.reply('Вы отписались от уведомлений о новых бизнесах. Подписаться снова — /subscribe.');
  });

  // «Взять в работу» в группе менеджеров.
  safe.callbackQuery(/^take:(\d+)$/, async (ctx) => {
    if (!isAdminId(env, ctx.from.id)) {
      await ctx.answerCallbackQuery({ text: 'Только для администраторов', show_alert: true });
      return;
    }
    const leadId = Number(ctx.match[1]);
    const res = await takeLead(db, leadId, ctx.from.id, displayName(ctx.from));
    if (!res.lead) {
      await ctx.answerCallbackQuery({ text: 'Заявка не найдена' });
      return;
    }
    await ctx.answerCallbackQuery({
      text: res.taken ? 'Заявка ваша' : `Уже в работе у ${res.lead.handledByName ?? 'другого администратора'}`,
    });
    await syncLeadMessage(env, db, leadId);
  });

  // ---- Группа менеджеров ----
  const group = safe.chatType(['group', 'supergroup']);
  const useThisGroup = async (chatId: number) => {
    await setSetting(db, MANAGERS_CHAT_KEY, String(chatId));
    await deleteSetting(db, MANAGERS_ERROR_KEY);
  };
  const GROUP_OK = 'Готово: заявки и уведомления каталога будут приходить в эту группу.\nНедоставленные заявки можно отправить из админки: «Заявки» → «Отправить недоставленные».';

  group.command('chatid', (ctx) => ctx.reply(`ID этого чата: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' }));
  group.command('setgroup', async (ctx) => {
    if (!ctx.from || !isAdminId(env, ctx.from.id)) {
      await ctx.reply('Команда доступна только администраторам каталога.');
      return;
    }
    await useThisGroup(ctx.chat.id);
    await ctx.reply(GROUP_OK);
  });
  // Группа стала супергруппой — у неё новый ID.
  group.on('message:migrate_to_chat_id', async (ctx) => {
    if ((await getManagersChat(env, db)) === String(ctx.chat.id)) {
      await setSetting(db, MANAGERS_CHAT_KEY, String(ctx.message.migrate_to_chat_id));
    }
  });

  safe.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    // Пользователь заблокировал бота — рассылка ему прекращается.
    if (ctx.chat.type === 'private') {
      if (status === 'kicked') await unsubscribe(db, ctx.from.id);
      return;
    }
    // Администратор каталога добавил бота в группу — она становится группой менеджеров.
    const was = ctx.myChatMember.old_chat_member.status;
    const joined = (status === 'member' || status === 'administrator') && (was === 'left' || was === 'kicked');
    console.log('bot membership', ctx.chat.id, was, '→', status, 'by', ctx.from.id);
    if (joined && isAdminId(env, ctx.from.id)) {
      await useThisGroup(ctx.chat.id);
      await ctx.api.sendMessage(ctx.chat.id, GROUP_OK).catch(() => {});
    }
  });

  pm.on('message', welcome);

  return bot;
}
