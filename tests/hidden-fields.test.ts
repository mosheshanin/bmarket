import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { businesses } from '../src/db/schema';
import { HIDDEN_BUSINESS_FIELDS, PUBLIC_BUSINESS_COLUMNS } from '../src/server/public';
import { renderLeadMessage } from '../src/server/leads';
import { buildMessage } from '../src/server/broadcast';

/**
 * Скрытые поля (реальное название, адрес, контакты продавца, заметки) никогда не попадают
 * в публичные ответы. Здесь — статическая проверка; e2e-тест проверяет живые HTML и API.
 */
describe('скрытые поля лота', () => {
  const publicKeys = Object.keys(PUBLIC_BUSINESS_COLUMNS);
  const publicDbNames = Object.values(PUBLIC_BUSINESS_COLUMNS).map((c) => c.name);

  it('публичная выборка не содержит скрытых полей', () => {
    for (const f of HIDDEN_BUSINESS_FIELDS) expect(publicKeys).not.toContain(f);
    for (const n of ['real_name', 'exact_address', 'owner_name', 'owner_phone', 'owner_telegram', 'internal_notes']) {
      expect(publicDbNames).not.toContain(n);
    }
  });

  it('каждая колонка таблицы явно классифицирована как публичная или скрытая', () => {
    const all = Object.keys(getTableColumns(businesses));
    const classified = new Set<string>([...publicKeys, ...HIDDEN_BUSINESS_FIELDS, 'id']);
    const unclassified = all.filter((k) => !classified.has(k));
    // Новое поле в таблице должно быть осознанно добавлено в один из списков.
    expect(unclassified).toEqual([]);
  });

  it('сообщение менеджерам о заявке не содержит скрытых данных лота', () => {
    const text = renderLeadMessage(
      {
        id: 57, createdAt: Date.UTC(2026, 9, 24, 8, 42), updatedAt: 0, businessId: 1, name: 'Дмитрий <b>', phone: '+972541234567',
        preferredContact: 'whatsapp', comment: 'Интересует оборот', telegramUserId: 5, telegramUsername: 'dmitry_k', source: 'mini_app',
        utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null, consentAt: 0, status: 'new',
        adminNote: null, handledBy: null, handledByName: null, isRead: false, tgDelivered: null, tgMessageId: null, ipHash: null, anonymizedAt: null,
      },
      { lotNumber: 1001, publicTitle: 'Кофейня с террасой в центре Хайфы', priceIls: 450000 },
    );
    expect(text).toContain('Новая заявка №57');
    expect(text).toContain('Лот №1001 — Кофейня с террасой в центре Хайфы');
    expect(text).toContain('+972 54 123 4567');
    expect(text).toContain('https://wa.me/972541234567');
    expect(text).toContain('Дмитрий &lt;b&gt;'); // экранирование HTML
    expect(text).toContain('24.10.2026 11:42'); // время Израиля
    expect(text).not.toMatch(/SECRET|real_name|exact_address/);
  });

  it('рассылка подписчикам строится только из публичных полей', () => {
    const env = { SITE_URL: 'https://example.com', PUBLIC_IMAGES_URL: 'https://img.example.com' } as unknown as Env;
    const one = buildMessage(env, [{ id: 1, lotNumber: 1001, slug: 'kofeynya', publicTitle: 'Кофейня', priceIls: 450000, monthlyProfitIls: 35000, coverKey: 'lots/1001/a-1600.webp' }]);
    expect(one.text).toContain('Кофейня · ₪ 450 000 · прибыль ₪ 35 000 в месяц');
    expect(one.photo).toBe('https://img.example.com/lots/1001/a-1600.webp');
    expect(one.keyboard[0][0]).toMatchObject({ text: 'Смотреть', web_app: { url: 'https://example.com/business/1001-kofeynya' } });
    expect(one.keyboard[1][0]).toMatchObject({ callback_data: 'unsub' });

    const many = buildMessage(env, Array.from({ length: 10 }, (_, i) => ({
      id: i, lotNumber: 1001 + i, slug: 's', publicTitle: `Лот ${i}`, priceIls: 1000, monthlyProfitIls: null, coverKey: null,
    })));
    expect(many.text).toContain('Новые бизнесы на продажу');
    expect(many.text).toContain('И ещё 2 — в каталоге.');
    expect(many.photo).toBeNull();
  });
});
