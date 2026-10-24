-- Тестовые лоты (этап 2): только для локальной базы и staging, НЕ для production.
-- Скрытые поля заполнены маркерами SECRET-… — автотест проверяет, что они не попадают в публичные ответы.
-- Фото загружаются скриптом scripts/seed-photos.sh.

DELETE FROM business_photos WHERE business_id IN (SELECT id FROM businesses WHERE lot_number BETWEEN 1001 AND 1005);
DELETE FROM leads WHERE business_id IN (SELECT id FROM businesses WHERE lot_number BETWEEN 1001 AND 1005);
DELETE FROM events WHERE business_id IN (SELECT id FROM businesses WHERE lot_number BETWEEN 1001 AND 1005);
DELETE FROM businesses WHERE lot_number BETWEEN 1001 AND 1005;

INSERT INTO businesses (
  lot_number, slug, public_title, category_id, city_id, area_note, price_ils, price_negotiable,
  monthly_revenue_ils, monthly_profit_ils, payback_months, year_founded, employees_count, area_sqm,
  rent_monthly_ils, lease_until, legal_form, business_license, included_in_sale, owner_support, reason_for_sale,
  short_description, description, video_url, is_featured, status, published_at, notified_at,
  real_name, exact_address, owner_name, owner_phone, owner_telegram, internal_notes,
  created_at, updated_at, created_by, updated_by
) VALUES
(
  1001, 'kofeynya-s-terrasoy-v-tsentre-hayfy', 'Кофейня с террасой в центре Хайфы',
  (SELECT id FROM categories WHERE slug = 'cafe-restaurants'), (SELECT id FROM cities WHERE slug = 'haifa'),
  'центр города, пешеходная улица', 450000, 1, 120000, 35000, 13, 2017, 6, 85, 12000, '2029-12-31',
  'company', 'yes', '["equipment","furniture","inventory","client_base","website_social","brand","licenses"]',
  '2 недели обучения нового владельца', 'Владелец переезжает в другой город.',
  'Работающая кофейня на 40 мест с летней террасой, стабильный поток гостей и постоянные клиенты.',
  'Кофейня работает **с 2017 года** на оживлённой пешеходной улице в центре Хайфы.

## Что есть
- зал на 28 мест и терраса на 12 мест;
- профессиональная кофемашина и кухня для завтраков;
- постоянные клиенты из соседних офисов.

## Почему выгодно
Стабильная прибыль, понятные процессы, команда из 6 человек остаётся.',
  NULL, 1, 'published', CAST(strftime('%s','now') AS INTEGER) * 1000 - 2 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 2 * 86400000,
  'SECRET-REAL-NAME-1001 Café Carmel', 'SECRET-ADDRESS-1001 Herzl 1', 'SECRET-OWNER-1001', '+972500000001', '@secret_owner_1001', 'SECRET-NOTES-1001 комиссия 3%',
  CAST(strftime('%s','now') AS INTEGER) * 1000 - 10 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 2 * 86400000, 111111, 111111
),
(
  1002, 'barbershop-na-4-kresla-v-tel-avive', 'Барбершоп на 4 кресла в Тель-Авиве',
  (SELECT id FROM categories WHERE slug = 'beauty'), (SELECT id FROM cities WHERE slug = 'tel-aviv'),
  'Флорентин', 280000, 0, 65000, 22000, 13, 2019, 4, 45, 9000, '2027-06-30',
  'osek_murshe', 'yes', '["equipment","furniture","client_base","website_social","brand"]',
  'Месяц совместной работы', 'Владелец открывает новый проект.',
  'Барбершоп с узнаваемым брендом, записью на 2 недели вперёд и командой мастеров.',
  'Барбершоп на 4 рабочих места в районе Флорентин. Онлайн-запись, сильный Instagram, **постоянная клиентская база более 900 человек**.',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0, 'published', CAST(strftime('%s','now') AS INTEGER) * 1000 - 12 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 12 * 86400000,
  'SECRET-REAL-NAME-1002', 'SECRET-ADDRESS-1002', 'SECRET-OWNER-1002', '+972500000002', '@secret_owner_1002', 'SECRET-NOTES-1002',
  CAST(strftime('%s','now') AS INTEGER) * 1000 - 20 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 12 * 86400000, 222222, 222222
),
(
  1003, 'internet-magazin-tovarov-dlya-doma', 'Интернет-магазин товаров для дома',
  (SELECT id FROM categories WHERE slug = 'online'), (SELECT id FROM cities WHERE slug = 'rishon-lezion'),
  NULL, 190000, 1, 80000, 15000, 13, 2021, 2, NULL, NULL, NULL,
  'osek_murshe', 'not_required', '["inventory","client_base","website_social","brand"]',
  'Передача поставщиков и обучение работе с сайтом', 'Нет времени заниматься проектом.',
  'Онлайн-магазин с собственным сайтом, складским остатком и отлаженной доставкой по Израилю.',
  'Магазин работает с 2021 года. Сайт на популярной платформе, 2 сотрудника на упаковке, договоры с курьерскими службами.',
  NULL, 0, 'published', CAST(strftime('%s','now') AS INTEGER) * 1000 - 30 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 30 * 86400000,
  'SECRET-REAL-NAME-1003', 'SECRET-ADDRESS-1003', 'SECRET-OWNER-1003', '+972500000003', '@secret_owner_1003', 'SECRET-NOTES-1003',
  CAST(strftime('%s','now') AS INTEGER) * 1000 - 40 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 30 * 86400000, 111111, 111111
),
(
  1004, 'minimarket-v-ashdode', 'Минимаркет в жилом квартале Ашдода',
  (SELECT id FROM categories WHERE slug = 'grocery'), (SELECT id FROM cities WHERE slug = 'ashdod'),
  'жилой квартал', 350000, 0, 150000, 25000, 14, 2015, 3, 70, 8000, NULL,
  'company', 'yes', '["equipment","inventory"]', NULL, 'Продан.',
  'Минимаркет у дома с постоянными покупателями.', 'Снят с продажи — для проверки ответа 410.',
  NULL, 0, 'hidden', CAST(strftime('%s','now') AS INTEGER) * 1000 - 60 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 60 * 86400000,
  'SECRET-REAL-NAME-1004', 'SECRET-ADDRESS-1004', 'SECRET-OWNER-1004', '+972500000004', '@secret_owner_1004', 'SECRET-NOTES-1004',
  CAST(strftime('%s','now') AS INTEGER) * 1000 - 70 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 5 * 86400000, 111111, 111111
),
(
  1005, 'salon-krasoty-v-netanii', 'Салон красоты в Нетании',
  (SELECT id FROM categories WHERE slug = 'beauty'), (SELECT id FROM cities WHERE slug = 'netanya'),
  NULL, 210000, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
  NULL, NULL, '[]', NULL, NULL,
  'Черновик — не должен быть виден посетителям.', 'Черновик.',
  NULL, 0, 'draft', NULL, NULL,
  'SECRET-REAL-NAME-1005', 'SECRET-ADDRESS-1005', 'SECRET-OWNER-1005', '+972500000005', '@secret_owner_1005', 'SECRET-NOTES-1005',
  CAST(strftime('%s','now') AS INTEGER) * 1000 - 1 * 86400000, CAST(strftime('%s','now') AS INTEGER) * 1000 - 1 * 86400000, 222222, 222222
);

INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1001/seed-0-1600.webp', 'lots/1001/seed-0-600.webp', 1600, 1200, 0, 'Зал кофейни', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1001;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1001/seed-1-1600.webp', 'lots/1001/seed-1-600.webp', 1600, 1200, 1, 'Летняя терраса', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1001;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1001/seed-2-1600.webp', 'lots/1001/seed-2-600.webp', 1600, 1200, 2, 'Барная стойка', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1001;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1002/seed-0-1600.webp', 'lots/1002/seed-0-600.webp', 1600, 1200, 0, 'Зал барбершопа', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1002;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1002/seed-1-1600.webp', 'lots/1002/seed-1-600.webp', 1600, 1200, 1, 'Рабочие места', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1002;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1003/seed-0-1600.webp', 'lots/1003/seed-0-600.webp', 1600, 1200, 0, 'Склад', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1003;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1003/seed-1-1600.webp', 'lots/1003/seed-1-600.webp', 1600, 1200, 1, 'Упаковка заказов', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1003;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1004/seed-0-1600.webp', 'lots/1004/seed-0-600.webp', 1600, 1200, 0, 'Магазин', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1004;
INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at)
  SELECT id, 'lots/1005/seed-0-1600.webp', 'lots/1005/seed-0-600.webp', 1600, 1200, 0, 'Салон', CAST(strftime('%s','now') AS INTEGER) * 1000 FROM businesses WHERE lot_number = 1005;
