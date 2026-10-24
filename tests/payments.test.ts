import { describe, expect, it } from 'vitest';
import { GrammyError } from 'grammy';
import { fromPayPalValue, orderOutcome, toPayPalValue } from '../src/server/paypal';
import { describeTgError } from '../src/server/telegram';

const tgErr = (code: number, description: string) =>
  new GrammyError('call failed', { ok: false, error_code: code, description }, 'sendMessage', {});

describe('ошибки Telegram для администратора', () => {
  it('понятные причины', () => {
    expect(describeTgError(tgErr(400, 'Bad Request: chat not found'))).toMatch(/Группа не найдена.*\/setgroup/);
    expect(describeTgError(tgErr(403, 'Forbidden: bot was kicked from the group chat'))).toMatch(/не состоит в группе/);
    expect(describeTgError(tgErr(403, 'Forbidden: bot is not a member of the supergroup chat'))).toMatch(/не состоит в группе/);
    expect(describeTgError(tgErr(401, 'Unauthorized'))).toMatch(/токен/);
    expect(describeTgError(tgErr(400, 'Bad Request: something new'))).toBe('Telegram: 400 Bad Request: something new');
  });
});

describe('PayPal', () => {
  it('суммы в агоротах', () => {
    expect(toPayPalValue(19900)).toBe('199.00');
    expect(fromPayPalValue('199.00')).toBe(19900);
    expect(fromPayPalValue('0.1')).toBe(10);
  });
  it('итог заказа', () => {
    expect(orderOutcome({ id: 'A', status: 'CREATED' }).state).toBe('open');
    expect(orderOutcome({ id: 'A', status: 'APPROVED' }).state).toBe('approved');
    expect(orderOutcome({ id: 'A', status: 'VOIDED' }).state).toBe('failed');
    const done = orderOutcome({
      id: 'A', status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'C1', status: 'COMPLETED', amount: { currency_code: 'ILS', value: '199.00' } }] } }],
    });
    expect(done).toEqual({ state: 'completed', captureId: 'C1', amount: 19900, currency: 'ILS' });
    expect(orderOutcome({
      id: 'A', status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: 'C2', status: 'PENDING', amount: { currency_code: 'ILS', value: '199.00' } }] } }],
    }).state).toBe('pending');
  });
});
