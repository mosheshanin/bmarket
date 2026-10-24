import { describe, expect, it } from 'vitest';
import { parseAdminIds, signInitData, validateInitData } from '../src/lib/telegram-auth';
import { hmacSha256, toHex } from '../src/lib/crypto';

const TOKEN = '123456:TEST-TOKEN';
const now = Date.UTC(2026, 9, 24, 12, 0, 0);
const authDate = String(Math.floor(now / 1000) - 60);
const user = JSON.stringify({ id: 111111, first_name: 'Моше', username: 'moshe' });

describe('validateInitData — проверка подписи Telegram', () => {
  it('принимает корректно подписанные данные', async () => {
    const data = await signInitData({ auth_date: authDate, user, query_id: 'AAE', start_param: 'lot-1001' }, TOKEN);
    const r = await validateInitData(data, TOKEN, { now });
    expect(r?.user.id).toBe(111111);
    expect(r?.startParam).toBe('lot-1001');
  });

  it('совпадает с эталонным алгоритмом из документации Telegram', async () => {
    // secret_key = HMAC_SHA256(<bot_token>, "WebAppData"); hash = hex(HMAC_SHA256(data_check_string, secret_key))
    const fields = { auth_date: authDate, user };
    const dcs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = await hmacSha256('WebAppData', TOKEN);
    const hash = toHex(await hmacSha256(secret, dcs));
    const p = new URLSearchParams(fields);
    p.set('hash', hash);
    expect((await validateInitData(p.toString(), TOKEN, { now }))?.user.id).toBe(111111);
  });

  it('учитывает поле signature в строке проверки', async () => {
    const data = await signInitData({ auth_date: authDate, user, signature: 'abc_DEF-123' }, TOKEN);
    expect(await validateInitData(data, TOKEN, { now })).not.toBeNull();
  });

  it('отклоняет подделанного пользователя', async () => {
    const data = await signInitData({ auth_date: authDate, user }, TOKEN);
    const forged = data.replace(encodeURIComponent('111111'), encodeURIComponent('999999'));
    expect(forged).not.toBe(data);
    expect(await validateInitData(forged, TOKEN, { now })).toBeNull();
  });

  it('отклоняет подпись другим токеном бота', async () => {
    const data = await signInitData({ auth_date: authDate, user }, '999:OTHER');
    expect(await validateInitData(data, TOKEN, { now })).toBeNull();
  });

  it('отклоняет данные старше 24 часов', async () => {
    const old = String(Math.floor(now / 1000) - 24 * 3600 - 5);
    const data = await signInitData({ auth_date: old, user }, TOKEN);
    expect(await validateInitData(data, TOKEN, { now })).toBeNull();
  });

  it('отклоняет пустые и битые строки', async () => {
    for (const bad of ['', 'hash=zzz', 'user=1&auth_date=1', `auth_date=${authDate}&hash=${'0'.repeat(64)}`]) {
      expect(await validateInitData(bad, TOKEN, { now })).toBeNull();
    }
    expect(await validateInitData('x', '', { now })).toBeNull();
  });

  it('разбирает список администраторов', () => {
    expect([...parseAdminIds(' 111111, 222222 ,abc,,0')]).toEqual([111111, 222222]);
    expect(parseAdminIds(undefined).size).toBe(0);
  });
});
