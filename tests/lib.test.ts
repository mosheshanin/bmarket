import { describe, expect, it } from 'vitest';
import {
  formatDate, formatDateTime, formatEur, formatIls, formatPayback, formatUsd, normalizePhone, paybackMonths, plural, prettyPhone, roundForeign,
} from '../src/lib/format';
import { businessPath, parseLotSegment, slugify } from '../src/lib/slug';
import { renderMarkdown } from '../src/lib/markdown';
import { signToken, verifyToken } from '../src/lib/crypto';
import { parsePublicApi, parseSdmxCsv } from '../src/server/rates';
import { youtubeId } from '../src/server/card';
import { sniffImage } from '../src/server/admin/businesses';
import { isCacheablePath } from '../src/server/cache';

const N = ' ';

describe('форматы', () => {
  it('цены в шекелях и валюте', () => {
    expect(formatIls(450000)).toBe(`₪${N}450${N}000`);
    expect(roundForeign(144_602)).toBe(145_000);
    expect(roundForeign(9_876)).toBe(9_880);
    expect(formatUsd(450000, 3.112)).toBe(`≈${N}$145${N}000`);
    expect(formatEur(450000, 3.4844)).toBe(`≈${N}€129${N}000`);
  });
  it('окупаемость', () => {
    expect(paybackMonths(450000, 35000)).toBe(13);
    expect(paybackMonths(450000, null)).toBeNull();
    expect(paybackMonths(450000, 0)).toBeNull();
    expect(formatPayback(13)).toBe(`13${N}месяцев`);
    expect(formatPayback(1)).toBe(`1${N}месяц`);
    expect(formatPayback(22)).toBe(`22${N}месяца`);
    expect(formatPayback(30)).toBe(`30${N}месяцев (2,5${N}года)`);
    expect(formatPayback(36)).toBe(`36${N}месяцев (3${N}года)`);
    expect(plural(11, ['a', 'b', 'c'])).toBe('c');
    expect(plural(21, ['a', 'b', 'c'])).toBe('a');
  });
  it('даты по времени Израиля', () => {
    expect(formatDate(Date.UTC(2026, 9, 23, 22, 30))).toBe('24.10.2026'); // 01:30 в Израиле
    expect(formatDateTime(Date.UTC(2026, 9, 24, 8, 42))).toBe('24.10.2026 11:42');
  });
  it('телефоны', () => {
    expect(normalizePhone('054-123-4567')).toBe('+972541234567');
    expect(normalizePhone('+972 54 123 4567')).toBe('+972541234567');
    expect(normalizePhone('03-123-4567')).toBe('+97231234567');
    expect(normalizePhone('+7 912 345-67-89')).toBe('+79123456789');
    expect(normalizePhone('12345')).toBeNull();
    expect(prettyPhone('+972541234567')).toBe('+972 54 123 4567');
  });
});

describe('адреса', () => {
  it('транслитерация', () => {
    expect(slugify('Кофейня в Хайфе')).toBe('kofeynya-v-hayfe');
    expect(slugify('Барбершоп на 4 кресла — Тель-Авив!')).toBe('barbershop-na-4-kresla-tel-aviv');
    expect(slugify('Щедрый ёжик').length).toBeGreaterThan(0);
    expect(slugify('а'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
  it('номер лота из адреса', () => {
    expect(parseLotSegment('1001-kofeynya')).toBe(1001);
    expect(parseLotSegment('1001')).toBe(1001);
    expect(parseLotSegment('kofeynya')).toBeNull();
    expect(businessPath(1001, 'kofeynya')).toBe('/business/1001-kofeynya');
  });
  it('кешируемые пути', () => {
    expect(isCacheablePath('/')).toBe(true);
    expect(isCacheablePath('/business/1001-x')).toBe(true);
    expect(isCacheablePath('/business/1001-x/request')).toBe(true);
    expect(isCacheablePath('/admin')).toBe(false);
    expect(isCacheablePath('/api/leads')).toBe(false);
  });
});

describe('Markdown-санитайзер', () => {
  it('экранирует HTML и опасные ссылки', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n**жирный** [x](javascript:alert(1)) [ok](https://a.b) <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).toContain('href="https://a.b"');
  });
  it('заголовки сдвигаются ниже h2', () => {
    expect(renderMarkdown('# A\n## B')).toMatch(/<h3>A<\/h3>\s*<h4>B<\/h4>/);
  });
});

describe('подписанные ссылки', () => {
  it('проверяются и истекают', async () => {
    const t = await signToken('s', 'lot:5', 60);
    expect(await verifyToken('s', t)).toBe('lot:5');
    expect(await verifyToken('other', t)).toBeNull();
    expect(await verifyToken('s', t.replace('lot:5', 'lot:6'))).toBeNull();
    const expired = await signToken('s', 'lot:5', -10);
    expect(await verifyToken('s', expired)).toBeNull();
  });
});

describe('курсы Банка Израиля', () => {
  it('SDMX CSV', () => {
    const csv = `SERIES_CODE,FREQ,BASE_CURRENCY,COUNTER_CURRENCY,UNIT_MEASURE,DATA_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MULT,COMMENTS,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS
RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,,2026-10-22,3.107,YP
RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,,2026-10-23,3.112,YP`;
    expect(parseSdmxCsv(csv)).toEqual({ date: '2026-10-23', value: 3.112 });
    expect(parseSdmxCsv('garbage')).toBeNull();
  });
  it('PublicApi JSON', () => {
    const r = parsePublicApi({ exchangeRates: [
      { key: 'USD', currentExchangeRate: 3.112, unit: 1, lastUpdate: '2026-10-23T09:25:06Z' },
      { key: 'EUR', currentExchangeRate: 3.4844, unit: 1, lastUpdate: '2026-10-23T09:25:06Z' },
      { key: 'JPY', currentExchangeRate: 2.05, unit: 100, lastUpdate: '2026-10-23T09:25:06Z' },
    ] });
    expect(r).toEqual({ date: '2026-10-23', usdIls: 3.112, eurIls: 3.4844, source: 'boi_public_api' });
  });
});

describe('прочее', () => {
  it('YouTube', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=1')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://vimeo.com/1')).toBeNull();
  });
  it('сигнатуры изображений', () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]).buffer;
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(sniffImage(webp)).toBe('webp');
    expect(sniffImage(jpg)).toBe('jpg');
    expect(sniffImage(png)).toBeNull();
  });
});

describe('секрет приложения', () => {
  it('сайт не падает без токена бота', async () => {
    const { appSecret } = await import('../src/server/secrets');
    expect(await appSecret({ TELEGRAM_BOT_TOKEN: '' } as Env)).toBe('bmarket:no-bot-token');
    const a = await appSecret({ TELEGRAM_BOT_TOKEN: '1:A' } as Env);
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(await appSecret({ TELEGRAM_BOT_TOKEN: '1:A', TELEGRAM_WEBHOOK_SECRET: 'x' } as Env)).toBe('x');
  });
});
