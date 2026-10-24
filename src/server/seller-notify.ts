import { InlineKeyboard } from 'grammy';
import type { Business } from '../db/schema';
import { escapeHtml } from '../lib/format';
import { businessPath } from '../lib/slug';
import { siteUrl, tgApi } from './telegram';

/** Личное сообщение продавцу от бота. Ошибки (продавец не запускал бота) не критичны. */
export async function notifySeller(env: Env, tgId: number | null | undefined, html: string, button?: { text: string; path: string }) {
  if (!tgId || !env.TELEGRAM_BOT_TOKEN) return;
  const site = siteUrl(env);
  let kb: InlineKeyboard | undefined;
  if (button && site.startsWith('https://')) kb = new InlineKeyboard().webApp(button.text, site + button.path);
  try {
    await tgApi(env).sendMessage(tgId, html, { parse_mode: 'HTML', reply_markup: kb, link_preview_options: { is_disabled: true } });
  } catch (e) {
    console.warn('notifySeller failed', tgId, e instanceof Error ? e.message : e);
  }
}

export async function notifySellerPublished(env: Env, b: Business) {
  await notifySeller(
    env,
    b.sellerTgId,
    `✅ Ваше объявление №${b.lotNumber} «${escapeHtml(b.publicTitle)}» опубликовано в каталоге.\n\nИзменить его можно через запрос администратору — кнопка «Запросить изменения» в разделе «Мои объявления».`,
    { text: 'Открыть объявление', path: businessPath(b.lotNumber, b.slug) },
  );
}
