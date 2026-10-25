// Генерирует seed/israel-listings-2026-10.sql — 16 объявлений на русском и английском (doskatv.co.il, SMERGERS,
// BusinessesForSale), найденных 25.10.2026, с городом. Включает нужные города, добавляет новые (Кфар-Йона, Кейсария,
// Гиватаим), стоковые фото Unsplash и публикует лоты с ценой (без цены — черновики). Одна общая рассылка подписчикам.
// Запуск: node --experimental-strip-types scripts/import-israel-2026-10.mjs. Повторный запуск SQL безопасен.
import { writeFileSync } from 'node:fs';
import { slugify } from '../src/lib/slug.ts';
import { paybackMonths } from '../src/lib/format.ts';

const USD = 3.112; // курс Банка Израиля на 23.10.2026
const price = (usd) => Math.round((usd * USD) / 10_000) * 10_000;
const perMonth = (usdYear) => Math.round((usdYear * USD) / 12 / 500) * 500;
const pct = (v, p) => Math.round((v * p) / 500) * 500;
const SM = 'https://www.smergers.com/business/';

const NEW_CITIES = [
  ['kfar-yona', 'Кфар-Йона', 'Кфар-Йоне'],
  ['caesarea', 'Кейсария', 'Кейсарии'],
  ['givatayim', 'Гиватаим', 'Гиватаиме'],
];
const ENABLE = ['tel-aviv', 'jerusalem', 'rishon-lezion', 'petah-tikva', 'netanya', 'ramat-gan', 'raanana'];

const L = [
  { src: 'doskatv.co.il', url: 'https://doskatv.co.il/a/1381943', posted: '11.07.2026', city: 'kfar-yona', cat: 'logistics',
    title: 'Линия дистрибуции молочной продукции', price: 720000, revenue: 50000, profit: 40000,
    inc: ['equipment', 'client_base'], reason: 'Владелец переезжает за границу.',
    short: 'Готовая линия развозки молочной продукции крупного производителя: 24 постоянных клиента и эксклюзивный маршрут.',
    desc: `Действующая **линия развозки молочной продукции** по прямому договору с крупным производителем, работает 18 лет.

- 24 постоянных коммерческих клиента: супермаркеты, магазины, маколеты; эксклюзивность на маршруте;
- 12–16 точек в день, развозка ежедневно;
- грузовик на 12–15 тонн входит в продажу;
- оборот ₪ 50–60 тыс. в месяц без НДС, чистая прибыль около ₪ 40 тыс. (по словам продавца);
- первый месяц — сопровождение и обучение; договор переоформляется на нового владельца после утверждения производителем.

Финансовые отчёты — при личной встрече.`,
    photos: ['1601467995997-ac1ae9a8fff4', '1780076700589-0a6413977d63'] },
  { src: 'doskatv.co.il', url: 'https://doskatv.co.il/a/1658371', posted: '10.09.2026', city: 'netanya', cat: 'grocery',
    title: 'Магазин деликатесов на севере Нетании', area: 'Север города, жилой район', price: 200000, negotiable: true, sqm: 50, year: 2003,
    inc: ['equipment', 'furniture'], exact: 'ул. Бэри (номер дома — в исходном объявлении)',
    short: 'Магазин деликатесов 50 м², работает с 2003 года: холодильные витрины и всё оборудование входят в продажу.',
    desc: `Действующий **магазин деликатесов** в жилом районе на севере Нетании, работает с 2003 года. Некошерный.

- площадь 50 м²;
- ассортимент: колбасы, мясо и рыба, сыры, консервы, сладости, напитки и алкоголь, товары на каждый день;
- в продажу входят холодильные витрины, стеллажи, кондиционер, кассовая зона и вывеска.

Срочная продажа, торг возможен.`,
    photos: ['1610057052613-bb574bb4e4c9', '1511019075502-c3734f9a7cff'] },
  { src: 'SMERGERS', url: SM + 'profitable-industrial-plant-construction-company-equity-stake-for-sale-in-caesarea-israel/vzlli/', city: 'caesarea', cat: 'other',
    title: 'Доля 49% в компании по строительству промышленных объектов', price: price(500000), revenue: perMonth(600000),
    short: 'Продаётся 49% прибыльной компании, которая строит промышленные объекты.',
    desc: `Продаётся **доля 49%** в прибыльной компании по строительству промышленных объектов.

- оборот около $600 000 в год;
- рентабельность по EBITDA — 10–20%.

Цена в источнике — $500 000, пересчитана в шекели по курсу Банка Израиля.`,
    photos: ['1565866926760-213f0b57e8b6', '1768128834406-f5b1b962af9d'] },
  { src: 'SMERGERS', url: SM + 'medical-equipment-wholesale-company-equity-stake-for-sale-in-tel-aviv-yafo-israel/7fiy6/', city: 'tel-aviv', cat: 'health',
    title: 'Доля 40% в оптовой торговле медоборудованием', price: price(850000),
    short: 'Продаётся 40% компании, которая оптом поставляет медицинское оборудование.',
    desc: `Продаётся **доля 40%** в компании по оптовой торговле медицинским оборудованием.

Цена в источнике — $850 000, пересчитана в шекели по курсу Банка Израиля.`,
    photos: ['1773946836315-bd8269b62b93', '1584820927498-cfe5211fd8bf'] },
  { src: 'SMERGERS', url: SM + 'home-appliances-business-equity-stake-for-sale-in-jerusalem-israel/jurvl/', city: 'jerusalem', cat: 'retail',
    title: 'Доля 20% в бизнесе бытовой техники', price: price(80000),
    short: 'Продаётся 20% бизнеса по продаже бытовой техники.',
    desc: `Продаётся **доля 20%** в бизнесе по продаже бытовой техники.

Цена в источнике — $80 000, пересчитана в шекели по курсу Банка Израиля.`,
    photos: ['1740803292822-a742c6a4fef0', '1740803292814-13d2e35924c3'] },
  { src: 'BusinessesForSale', url: 'https://israel.businessesforsale.com/israeli/profitable-boutique-flower-shop-in-ra-anana.aspx', city: 'raanana', cat: 'retail',
    title: 'Цветочный бутик в Раанане', price: null,
    short: 'Прибыльный цветочный бутик в Раанане.',
    desc: `Действующий **цветочный бутик** в Раанане. По словам владельца — прибыльный.

Цена — по запросу.`,
    photos: ['1589244159943-460088ed5c92', '1558861122-40aa75d3a841'] },
  { src: 'BusinessesForSale', url: 'https://israel.businessesforsale.com/israeli/innovative-hebrew-courses.aspx', city: 'jerusalem', cat: 'education',
    title: 'Курсы иврита', price: null,
    short: 'Курсы иврита в Иерусалиме: оборот до $100 000, прибыль до $50 000 в год.',
    desc: `**Курсы иврита** по собственной инновационной программе.

- оборот — до $100 000 в год;
- прибыль — до $50 000 в год.

Цена в источнике — до $100 000.`,
    photos: ['1668092547528-62bdec358652', '1581726690015-c9861fa5057f'] },
  { src: 'SMERGERS', url: SM + 'cleaning-business-for-sale-in-tel-aviv-yafo-israel/8adiu/', city: 'tel-aviv', cat: 'services',
    title: 'Клининговая компания в Тель-Авиве', price: price(650000), revenue: perMonth(180000), profit: pct(perMonth(180000), 0.35),
    short: 'Клининг для квартир, офисов и жилых комплексов с растущей клиентской базой.',
    desc: `Давно работающая **клининговая компания**: уборка квартир, офисов и жилых комплексов.

- оборот около $180 000 в год;
- рентабельность по EBITDA — около 35%;
- клиентская база растёт.

Цена в источнике — $650 000, пересчитана в шекели.`,
    photos: ['1781637590564-01c65dbf2039', '1774494168068-0f716c3aafcf'] },
  { src: 'SMERGERS', url: SM + 'optical-store-for-sale-in-ramat-gan-israel/95z60/', city: 'ramat-gan', cat: 'health',
    title: 'Оптика с выездной клиникой', price: price(390000), revenue: perMonth(620000), profit: pct(perMonth(620000), 0.25),
    short: 'Бутик модных очков и выездная клиника, которая обслуживает сотрудников хайтек-компаний.',
    desc: `**Бутик модной оптики** с **выездной клиникой**: проверка зрения и подбор очков прямо в офисах хайтек-компаний.

- оборот около $620 000 в год;
- рентабельность по EBITDA — около 25%.

Цена в источнике — $390 000, пересчитана в шекели.`,
    photos: ['1615468822882-4828d2602857', '1608539733377-5557e02926b5'] },
  { src: 'SMERGERS', url: SM + 'training-institute-for-sale-in-ramat-gan-israel/i8nz8/', city: 'ramat-gan', cat: 'education',
    title: 'Лицензированный центр профобучения', price: price(3200000), revenue: perMonth(1100000),
    short: 'Лицензированный центр профессионального обучения с многолетней репутацией.',
    desc: `**Центр профессионального обучения** с лицензией и многолетней репутацией, есть служба поддержки студентов.

- оборот около $1,1 млн в год.

Цена в источнике — $3,2 млн, пересчитана в шекели.`,
    photos: ['1758270704080-e3556e6794a7', '1664382953481-141e97ad9825'] },
  { src: 'SMERGERS', url: SM + 'womens-apparel-store-for-sale-in-jerusalem-israel/p1tjd/', city: 'jerusalem', cat: 'retail',
    title: 'Бутик женской одежды в Иерусалиме', price: Math.round((8000 * USD) / 1000) * 1000, revenue: perMonth(155000), profit: Math.round((perMonth(155000) * 0.06) / 100) * 100,
    inc: ['equipment', 'furniture'],
    short: 'Бутик женской одежды: больше 50 покупателей в день и хорошая репутация в районе.',
    desc: `**Бутик женской одежды** в Иерусалиме с хорошей репутацией — покупатели приходят по рекомендациям.

- больше 50 покупателей в день;
- оборот около $155 000 в год, рентабельность по EBITDA — около 6%;
- оборудование и мебель входят в продажу.

Цена в источнике — $8 000, пересчитана в шекели.`,
    photos: ['1532453288672-3a27e9be9efd', '1445205170230-053b83016050'] },
  { src: 'SMERGERS', url: SM + 'profitable-precision-components-business-for-sale-in-jerusalem-israel/0ut6h/', city: 'jerusalem', cat: 'manufacturing',
    title: '3D-печать металлом для стоматологии', price: price(480000), revenue: perMonth(174000), profit: pct(perMonth(174000), 0.4),
    short: 'Производство стоматологических компонентов на 3D-принтерах по металлу: стабильные клиенты, мало конкурентов.',
    desc: `Компания печатает **металлические компоненты для стоматологии** на 3D-принтерах.

- стабильная база клиентов, в стране мало конкурентов;
- оборот около $174 000 в год;
- рентабельность по EBITDA — около 40%.

Цена в источнике — $480 000, пересчитана в шекели.`,
    photos: ['1611505908502-5b67e53e3a76', '1609862776364-897efc7dafdb'] },
  { src: 'SMERGERS', url: SM + 'profitable-electronic-equipment-business-for-sale-in-rishon-lezion-israel/ifhfi/', city: 'rishon-lezion', cat: 'manufacturing',
    title: 'Производство ультразвуковых отпугивателей грызунов', price: price(640000), revenue: perMonth(193000), profit: pct(perMonth(193000), 0.4),
    short: 'Производитель ультразвуковых систем от грызунов с 30-летней историей и около 90 клиентами.',
    desc: `**Производство ультразвуковых систем защиты от грызунов**, компания работает около 30 лет.

- около 90 клиентов;
- оборот около $193 000 в год;
- рентабельность по EBITDA — около 40%.

Цена в источнике — $640 000, пересчитана в шекели.`,
    photos: ['1651340550839-3b295d930048', '1675602488512-bdd631490fcb'] },
  { src: 'SMERGERS', url: SM + 'immigration-consulting-company-for-sale-in-givatayim-israel/37v8y/', city: 'givatayim', cat: 'services',
    title: 'Иммиграционное агентство', price: price(3540000), revenue: perMonth(3700000),
    short: 'Лицензированное иммиграционное агентство: 7 лет работы, около 15 000 клиентов.',
    desc: `**Иммиграционное агентство** с лицензией, работает 7 лет.

- обслужило около 15 000 клиентов;
- оборот около $3,7 млн в год;
- рентабельность по EBITDA — 30–40%.

Цена в источнике — $3,54 млн, пересчитана в шекели.`,
    photos: ['1551135049-8a33b5883817', '1758518727653-5650fd9e146c'] },
  { src: 'SMERGERS', url: SM + 'profitable-medical-devices-company-for-sale-in-petah-tikva-israel/9lafv/', city: 'petah-tikva', cat: 'health',
    title: 'Компания-производитель медицинского прибора', price: price(13000000), revenue: perMonth(1200000), profit: pct(perMonth(1200000), 0.4),
    short: 'Медицинский прибор от менструальной боли с одобрением FDA и более чем 6 000 подписчиков.',
    desc: `Компания продаёт **медицинский прибор для облегчения менструальной боли**, одобренный FDA.

- больше 6 000 подписчиков;
- оборот около $1,2 млн в год;
- рентабельность по EBITDA — около 40%.

Цена в источнике — $13 млн, пересчитана в шекели.`,
    photos: ['1603398938378-e54eab446dde', '1784864535284-fc27093e5863'] },
  { src: 'SMERGERS', url: SM + 'funeral-services-business-for-sale-in-tel-aviv-yafo-israel/oyyvx/', city: 'tel-aviv', cat: 'online',
    title: 'Приложение для цифровых завещаний', price: price(160000),
    short: 'Приложение для хранения цифровых завещаний и посланий близким: бета-версия в Google Play, без выручки.',
    desc: `**Мобильное приложение** для хранения цифровых завещаний и посланий, которые получат близкие.

- бета-версия опубликована в Google Play;
- выручки пока нет — это стартап на ранней стадии.

Цена в источнике — $160 000, пересчитана в шекели.`,
    photos: ['1551650975-87deedd944c3', '1526045612212-70caf35c14df'] },
];

const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const now = `CAST(strftime('%s','now') AS INTEGER) * 1000`;
const OWNER = 352078684;
const FIRST = 1044;
const MARK = 'ИМПОРТ-2 25.10.2026';
const out = [`-- ${L.length} объявлений (RU/EN) с городом, 25.10.2026 (scripts/import-israel-2026-10.mjs). Повторный запуск безопасен.`];

// Города
NEW_CITIES.forEach(([slug, name, prep], i) => out.push(
  `INSERT INTO cities (name, name_prepositional, slug, sort_order, is_active) SELECT ${q(name)}, ${q(prep)}, ${q(slug)}, ${220 + i * 10}, 1 WHERE NOT EXISTS (SELECT 1 FROM cities WHERE slug = ${q(slug)});`,
));
out.push(`UPDATE cities SET is_active = 1 WHERE slug IN (${[...ENABLE, ...NEW_CITIES.map((c) => c[0])].map(q).join(', ')});`);

// Лоты
L.forEach((l, i) => {
  const lot = FIRST + i;
  const notes = [
    `${MARK} — ${l.src}${l.posted ? `, объявление от ${l.posted}` : ''}: ${l.url}`,
    'Добавлено по решению владельца каталога. Согласие продавца на размещение — подтвердить. Цифры — из исходного объявления, проверить.',
    `Уточнить у продавца: фото бизнеса${l.price ? '' : '; ЦЕНУ'}; оборот и прибыль в месяц, аренда и срок договора, что входит в продажу.`,
  ].join('\n');
  const vals = [
    lot, q(slugify(l.title)), q(l.title), `(SELECT id FROM categories WHERE slug = ${q(l.cat)})`, `(SELECT id FROM cities WHERE slug = ${q(l.city)})`,
    q(l.area ?? null), q(l.price), l.negotiable ? 1 : 0, q(l.revenue ?? null), q(l.profit ?? null), q(paybackMonths(l.price, l.profit)),
    q(l.year ?? null), q(l.sqm ?? null), q(JSON.stringify(l.inc ?? [])), q(l.reason ?? null), q(l.short), q(l.desc), q(l.exact ?? null), q(notes),
    now, now, OWNER, OWNER,
  ];
  out.push(
    `INSERT INTO businesses (lot_number, slug, public_title, category_id, city_id, area_note, price_ils, price_negotiable, monthly_revenue_ils, monthly_profit_ils, payback_months, year_founded, area_sqm, included_in_sale, reason_for_sale, short_description, description, exact_address, internal_notes, created_at, updated_at, created_by, updated_by) ` +
      `SELECT ${vals.join(', ')} WHERE NOT EXISTS (SELECT 1 FROM businesses WHERE lot_number = ${lot});`,
  );
});

// Фото
const rows = [];
L.forEach((l, i) => l.photos.forEach((id, n) => rows.push(`(${FIRST + i}, '${id}', ${n}, ${q(`${l.title} — фото для иллюстрации`)})`)));
for (let i = 0; i < rows.length; i += 16) {
  out.push(
    `INSERT INTO business_photos (business_id, r2_key, r2_key_small, width, height, sort_order, alt, created_at) ` +
      `SELECT b.id, 'unsplash:' || v.column2 || ':1600', 'unsplash:' || v.column2 || ':600', 1600, 1200, v.column3, v.column4, ${now} ` +
      `FROM (VALUES ${rows.slice(i, i + 16).join(', ')}) v JOIN businesses b ON b.lot_number = v.column1 ` +
      `WHERE NOT EXISTS (SELECT 1 FROM business_photos p WHERE p.business_id = b.id AND p.r2_key = 'unsplash:' || v.column2 || ':1600' AND p.deleted_at IS NULL);`,
  );
}

// Публикация: только черновики этого импорта с ценой и городом; рассылка — одна подборка.
const pubWhere = `status = 'draft' AND internal_notes LIKE '${MARK}%' AND price_ils IS NOT NULL AND city_id IS NOT NULL`;
out.push(`INSERT INTO audit_log (business_id, admin_id, admin_name, action, created_at) SELECT id, ${OWNER}, 'Claude по просьбе владельца', 'publish', ${now} FROM businesses WHERE ${pubWhere};`);
out.push(`INSERT INTO broadcasts (status, business_ids, scheduled_at, created_at) SELECT 'pending', (SELECT json_group_array(id) FROM (SELECT id FROM businesses WHERE ${pubWhere} AND notified_at IS NULL ORDER BY lot_number)), max(${now} + 120000, ifnull((SELECT max(scheduled_at) FROM broadcasts), 0) + 7200000), ${now} WHERE EXISTS (SELECT 1 FROM businesses WHERE ${pubWhere} AND notified_at IS NULL);`);
out.push(`UPDATE businesses SET status = 'published', published_at = ${now} - (lot_number - ${FIRST}) * 60000, notified_at = ifnull(notified_at, ${now}), updated_at = ${now}, updated_by = ${OWNER} WHERE ${pubWhere};`);

writeFileSync('seed/israel-listings-2026-10.sql', out.join('\n') + '\n');
console.log(`${L.length} лотов №${FIRST}–№${FIRST + L.length - 1}, ${rows.length} фото, ${out.length} запросов`);
