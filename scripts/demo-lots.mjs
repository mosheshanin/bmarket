// Генерирует seed/demo-lots.sql — 10 демонстрационных объявлений для рабочего каталога.
// Запуск: node --experimental-strip-types scripts/demo-lots.mjs
// Применение: через Cloudflare (D1 → Console) или `wrangler d1 execute catalog-prod --remote --file seed/demo-lots.sql`.
// Все лоты помечены в скрытых заметках как ДЕМО — перед реальным запуском их нужно снять с публикации.
import { writeFileSync } from 'node:fs';
import { slugify } from '../src/lib/slug.ts';

const DAY = 86_400_000;
const LOTS = [
  {
    lot: 1001, featured: true, daysAgo: 1, city: 'haifa', cat: 'cafe-restaurants',
    title: 'Кофейня с террасой в центре Хайфы', area: 'Адар, пешеходная улица',
    price: 450000, negotiable: true, revenue: 120000, profit: 35000, rent: 12000, year: 2017, staff: 6, sqm: 85, lease: '2029-12-31',
    legal: 'company', license: 'yes', inc: ['equipment', 'furniture', 'inventory', 'client_base', 'website_social', 'brand', 'licenses'],
    support: '2 недели обучения нового владельца', reason: 'Владелец переезжает в другой город.',
    short: 'Кофейня на 40 мест с летней террасой: стабильный поток гостей, постоянные клиенты из соседних офисов.',
    desc: `Кофейня работает **с 2017 года** на оживлённой пешеходной улице.

## Что есть
- зал на 28 мест и терраса на 12 мест;
- профессиональная кофемашина, кухня для завтраков и выпечки;
- постоянные клиенты из соседних офисов и студенты.

## Почему выгодно
Стабильная прибыль весь год, понятные процессы, команда из 6 человек готова остаться.`,
  },
  {
    lot: 1002, daysAgo: 3, city: 'tel-aviv', cat: 'beauty',
    title: 'Барбершоп на 4 кресла во Флорентине', area: 'Флорентин',
    price: 280000, negotiable: false, revenue: 65000, profit: 22000, rent: 9000, year: 2019, staff: 4, sqm: 45, lease: '2027-06-30',
    legal: 'osek_murshe', license: 'yes', inc: ['equipment', 'furniture', 'client_base', 'website_social', 'brand'],
    support: 'Месяц совместной работы', reason: 'Владелец открывает новый проект за границей.',
    short: 'Барбершоп с узнаваемым брендом и онлайн-записью на две недели вперёд.',
    desc: `Барбершоп на **4 рабочих места** в одном из самых модных районов Тель-Авива.

- онлайн-запись и база из 900+ постоянных клиентов;
- сильный Instagram, отзывы 4,9;
- мастера работают по проценту — команда остаётся.`,
  },
  {
    lot: 1003, daysAgo: 5, city: 'rishon-lezion', cat: 'online',
    title: 'Интернет-магазин товаров для дома', area: null,
    price: 190000, negotiable: true, revenue: 80000, profit: 13000, rent: null, year: 2021, staff: 2, sqm: null, lease: null,
    legal: 'osek_murshe', license: 'not_required', inc: ['inventory', 'client_base', 'website_social', 'brand'],
    support: 'Передача поставщиков и обучение работе с сайтом', reason: 'Владельцу не хватает времени на проект.',
    short: 'Онлайн-магазин с собственным сайтом, складским остатком и отлаженной доставкой по всему Израилю.',
    desc: `Магазин работает с 2021 года, продажи — через сайт и маркетплейсы.

- 1 200+ заказов в год, 35% повторных покупок;
- договоры с курьерскими службами по всей стране;
- небольшой склад-офис, можно вести из дома.`,
  },
  {
    lot: 1004, daysAgo: 9, city: 'ashdod', cat: 'grocery',
    title: 'Минимаркет в жилом квартале Ашдода', area: 'жилой квартал, рядом школа',
    price: 520000, negotiable: false, revenue: 180000, profit: 32000, rent: 11000, year: 2015, staff: 4, sqm: 110, lease: '2030-03-31',
    legal: 'company', license: 'yes', inc: ['equipment', 'furniture', 'inventory', 'licenses'],
    support: '3 недели, знакомство с поставщиками', reason: 'Семейные обстоятельства.',
    short: 'Минимаркет у дома с постоянными покупателями, работает 7 дней в неделю.',
    desc: `Магазин «у дома» в плотно заселённом квартале.

- холодильное оборудование обновлено в 2024 году;
- лицензия на продажу алкоголя;
- доставка по району через WhatsApp.`,
  },
  {
    lot: 1005, daysAgo: 13, city: 'netanya', cat: 'fitness',
    title: 'Студия пилатеса у моря в Нетании', area: 'набережная',
    price: 240000, negotiable: true, revenue: 52000, profit: 16000, rent: 8500, year: 2020, staff: 3, sqm: 120, lease: '2028-09-30',
    legal: 'osek_murshe', license: 'not_required', inc: ['equipment', 'furniture', 'client_base', 'website_social', 'brand'],
    support: 'Месяц, передача тренеров и расписания', reason: 'Владелица уходит в декрет.',
    short: 'Студия пилатеса и растяжки: 140 активных абонементов, вид на море из зала.',
    desc: `Светлый зал на **120 м²** с видом на море.

- 8 реформеров и зона для групповых занятий;
- 140 активных абонементов, занятия по записи;
- 3 тренера на почасовой оплате.`,
  },
  {
    lot: 1006, daysAgo: 18, city: 'beer-sheva', cat: 'auto',
    title: 'Автомойка с детейлингом в Беэр-Шеве', area: 'промзона',
    price: 390000, negotiable: true, revenue: 95000, profit: 27000, rent: 10000, year: 2018, staff: 5, sqm: 300, lease: '2031-12-31',
    legal: 'company', license: 'yes', inc: ['equipment', 'client_base', 'brand', 'licenses'],
    support: '2 недели', reason: 'Владелец переходит в другую отрасль.',
    short: 'Автомойка на 2 поста с полировкой и химчисткой салона, договоры с автопарками.',
    desc: `Мойка в промзоне рядом с крупными автосалонами.

- 2 поста, система очистки воды;
- детейлинг: полировка, керамика, химчистка;
- договоры на обслуживание с 3 автопарками компаний.`,
  },
  {
    lot: 1007, daysAgo: 24, city: 'petah-tikva', cat: 'cafe-restaurants',
    title: 'Пекарня-кондитерская в Петах-Тикве', area: 'центр города',
    price: 610000, negotiable: false, revenue: 160000, profit: 42000, rent: 14000, year: 2014, staff: 7, sqm: 95, lease: '2029-06-30',
    legal: 'company', license: 'yes', inc: ['equipment', 'furniture', 'inventory', 'client_base', 'brand', 'licenses'],
    support: 'Месяц, передача рецептур', reason: 'Владельцы выходят на пенсию.',
    short: 'Пекарня с собственным производством и кошерным сертификатом, оптовые поставки в кафе.',
    desc: `Пекарня работает **более 10 лет**.

- собственный цех и кошерный сертификат;
- витрина на 6 метров, кофе навынос;
- оптовые поставки в 12 кафе города.`,
  },
  {
    lot: 1008, daysAgo: 31, city: 'modiin', cat: 'education',
    title: 'Детский развивающий центр в Модиине', area: 'новый район',
    price: 330000, negotiable: true, revenue: 70000, profit: 21000, rent: 9500, year: 2019, staff: 6, sqm: 140, lease: '2028-12-31',
    legal: 'osek_murshe', license: 'yes', inc: ['equipment', 'furniture', 'client_base', 'website_social', 'brand'],
    support: '2 месяца, передача педагогов и программ', reason: 'Владелица переезжает за границу.',
    short: 'Кружки, подготовка к школе и праздники: 180 детей в неделю, своя методика.',
    desc: `Центр для детей 2–10 лет.

- 3 класса и игровая зона;
- подготовка к школе, английский, робототехника;
- праздники по выходным — дополнительный доход.`,
  },
  {
    lot: 1009, daysAgo: 38, city: 'jerusalem', cat: 'beauty',
    title: 'Студия маникюра в центре Иерусалима', area: 'центр города',
    price: 160000, negotiable: true, revenue: 38000, profit: 12000, rent: 6000, year: 2021, staff: 3, sqm: 35, lease: '2027-12-31',
    legal: 'osek_patur', license: 'not_required', inc: ['equipment', 'furniture', 'client_base', 'website_social'],
    support: '2 недели', reason: 'Владелица открывает салон в другом городе.',
    short: 'Студия маникюра и педикюра на 3 места с базой постоянных клиенток.',
    desc: `Уютная студия на **3 рабочих места** рядом с рынком.

- онлайн-запись, 600+ постоянных клиенток;
- новое оборудование и вытяжка;
- мастера готовы продолжить работу.`,
  },
  {
    lot: 1010, daysAgo: 45, city: 'holon', cat: 'logistics',
    title: 'Курьерская служба с договорами в Холоне', area: 'промзона',
    price: 270000, negotiable: false, revenue: 110000, profit: 19000, rent: 4500, year: 2016, staff: 8, sqm: 60, lease: '2027-03-31',
    legal: 'company', license: 'not_required', inc: ['equipment', 'client_base', 'website_social', 'brand'],
    support: 'Месяц, знакомство с клиентами', reason: 'Владелец сосредотачивается на другом бизнесе.',
    short: 'Доставка по Гуш-Дану для интернет-магазинов: 25 постоянных клиентов, свои курьеры.',
    desc: `Служба доставки по центру страны.

- 25 интернет-магазинов на постоянных договорах;
- 6 курьеров и диспетчерская программа;
- склад-пункт выдачи в промзоне.`,
  },
];

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const now = `CAST(strftime('%s','now') AS INTEGER) * 1000`;
const lines = [
  '-- 10 демонстрационных объявлений (сгенерировано scripts/demo-lots.mjs).',
  '-- Фото — статические иллюстрации public/demo/lots/. В скрытых заметках помечены как ДЕМО.',
  `DELETE FROM business_photos WHERE r2_key LIKE 'demo/%';`,
  `DELETE FROM businesses WHERE internal_notes LIKE 'ДЕМО%' AND lot_number BETWEEN 1001 AND 1010 AND NOT EXISTS (SELECT 1 FROM leads WHERE leads.business_id = businesses.id);`,
];
for (const l of LOTS) {
  const payback = Math.max(1, Math.round(l.price / l.profit));
  const pub = `${now} - ${l.daysAgo * DAY}`;
  lines.push(`INSERT INTO businesses (lot_number, slug, public_title, category_id, city_id, area_note, price_ils, price_negotiable, monthly_revenue_ils, monthly_profit_ils, payback_months, year_founded, employees_count, area_sqm, rent_monthly_ils, lease_until, legal_form, business_license, included_in_sale, owner_support, reason_for_sale, short_description, description, video_url, is_featured, status, published_at, notified_at, real_name, exact_address, owner_name, owner_phone, owner_telegram, internal_notes, created_at, updated_at, created_by, updated_by) VALUES (${[
    l.lot, q(slugify(l.title)), q(l.title), `(SELECT id FROM categories WHERE slug = ${q(l.cat)})`, `(SELECT id FROM cities WHERE slug = ${q(l.city)})`,
    q(l.area), l.price, l.negotiable ? 1 : 0, q(l.revenue), q(l.profit), payback, q(l.year), q(l.staff), q(l.sqm), q(l.rent), q(l.lease),
    q(l.legal), q(l.license), q(JSON.stringify(l.inc)), q(l.support), q(l.reason), q(l.short), q(l.desc), 'NULL', l.featured ? 1 : 0,
    `'published'`, pub, pub, `'ДЕМО — пример'`, 'NULL', 'NULL', 'NULL', 'NULL', `'ДЕМО: демонстрационное объявление. Снять с публикации перед реальным запуском.'`,
    pub, pub, 'NULL', 'NULL',
  ].join(', ')});`);
  for (const [i, alt] of [[0, `${l.title} — фасад`], [1, `${l.title} — интерьер`]]) {
    lines.push(`INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at) SELECT id, 'demo/lots/${l.lot}-${i}-1600.webp', 'demo/lots/${l.lot}-${i}-600.webp', 1600, 1200, ${i}, ${q(alt)}, ${now} FROM businesses WHERE lot_number = ${l.lot};`);
  }
}
writeFileSync(new URL('../seed/demo-lots.sql', import.meta.url), lines.join('\n') + '\n');
console.log(`seed/demo-lots.sql: ${LOTS.length} лотов`);
