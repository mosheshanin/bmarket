import { env } from 'cloudflare:workers';
import { getDb } from '../db/client';
import { botLink, miniAppLink, siteUrl } from './telegram';

export function db() {
  return getDb(env.DB);
}

export function site() {
  return {
    name: env.PROJECT_NAME || 'BMarket',
    url: siteUrl(env),
    botLink: botLink(env),
    botSubscribeLink: botLink(env, 'subscribe'),
    botSellLink: botLink(env, 'sell'),
    miniAppLink: miniAppLink(env),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    analyticsToken: env.CF_ANALYTICS_TOKEN || '',
    botUsername: env.TELEGRAM_BOT_USERNAME || '',
    appShortName: env.TELEGRAM_APP_SHORT_NAME || 'app',
  };
}

export { env };
