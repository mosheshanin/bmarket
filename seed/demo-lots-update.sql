-- Обновить тексты и город демо-лотов (сгенерировано scripts/demo-lots.mjs).
UPDATE businesses SET slug = 'kofeynya-s-terrasoy-v-tsentre-hayfy', public_title = 'Кофейня с террасой в центре Хайфы', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Адар, пешеходная улица', short_description = 'Кофейня на 40 мест с летней террасой: стабильный поток гостей, постоянные клиенты из соседних офисов.', description = 'Кофейня работает **с 2017 года** на оживлённой пешеходной улице.

## Что есть
- зал на 28 мест и терраса на 12 мест;
- профессиональная кофемашина, кухня для завтраков и выпечки;
- постоянные клиенты из соседних офисов и студенты.

## Почему выгодно
Стабильная прибыль весь год, понятные процессы, команда из 6 человек готова остаться.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1001 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'barbershop-na-4-kresla-v-germanskoy-kolonii', public_title = 'Барбершоп на 4 кресла в Германской колонии', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Германская колония', short_description = 'Барбершоп с узнаваемым брендом и онлайн-записью на две недели вперёд.', description = 'Барбершоп на **4 рабочих места** в одном из самых популярных районов Хайфы.

- онлайн-запись и база из 900+ постоянных клиентов;
- сильный Instagram, отзывы 4,9;
- мастера работают по проценту — команда остаётся.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1002 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'internet-magazin-tovarov-dlya-doma', public_title = 'Интернет-магазин товаров для дома', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = NULL, short_description = 'Онлайн-магазин с собственным сайтом, складским остатком и отлаженной доставкой по всему Израилю.', description = 'Магазин работает с 2021 года, продажи — через сайт и маркетплейсы.

- 1 200+ заказов в год, 35% повторных покупок;
- договоры с курьерскими службами по всей стране;
- небольшой склад-офис, можно вести из дома.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1003 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'minimarket-v-zhilom-kvartale-na-karmele', public_title = 'Минимаркет в жилом квартале на Кармеле', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Кармель, жилой квартал, рядом школа', short_description = 'Минимаркет у дома с постоянными покупателями, работает 7 дней в неделю.', description = 'Магазин «у дома» в плотно заселённом квартале.

- холодильное оборудование обновлено в 2024 году;
- лицензия на продажу алкоголя;
- доставка по району через WhatsApp.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1004 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'studiya-pilatesa-u-morya-v-bat-galime', public_title = 'Студия пилатеса у моря в Бат-Галиме', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Бат-Галим, набережная', short_description = 'Студия пилатеса и растяжки: 140 активных абонементов, вид на море из зала.', description = 'Светлый зал на **120 м²** с видом на море.

- 8 реформеров и зона для групповых занятий;
- 140 активных абонементов, занятия по записи;
- 3 тренера на почасовой оплате.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1005 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'avtomoyka-s-deteylingom-v-hayfskom-zalive', public_title = 'Автомойка с детейлингом в Хайфском заливе', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'промзона Мифрац', short_description = 'Автомойка на 2 поста с полировкой и химчисткой салона, договоры с автопарками.', description = 'Мойка в промзоне рядом с крупными автосалонами.

- 2 поста, система очистки воды;
- детейлинг: полировка, керамика, химчистка;
- договоры на обслуживание с 3 автопарками компаний.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1006 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'pekarnya-konditerskaya-v-nizhnem-gorode', public_title = 'Пекарня-кондитерская в Нижнем городе', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Нижний город', short_description = 'Пекарня с собственным производством и кошерным сертификатом, оптовые поставки в кафе.', description = 'Пекарня работает **более 10 лет**.

- собственный цех и кошерный сертификат;
- витрина на 6 метров, кофе навынос;
- оптовые поставки в 12 кафе города.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1007 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'detskiy-razvivayuschiy-tsentr-v-neve-shaanane', public_title = 'Детский развивающий центр в Неве-Шаанане', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Неве-Шаанан', short_description = 'Кружки, подготовка к школе и праздники: 180 детей в неделю, своя методика.', description = 'Центр для детей 2–10 лет.

- 3 класса и игровая зона;
- подготовка к школе, английский, робототехника;
- праздники по выходным — дополнительный доход.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1008 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'studiya-manikyura-na-moria', public_title = 'Студия маникюра на Мориа', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'Кармель, проспект Мориа', short_description = 'Студия маникюра и педикюра на 3 места с базой постоянных клиенток.', description = 'Уютная студия на **3 рабочих места** рядом с рынком.

- онлайн-запись, 600+ постоянных клиенток;
- новое оборудование и вытяжка;
- мастера готовы продолжить работу.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1009 AND internal_notes LIKE 'ДЕМО%';
UPDATE businesses SET slug = 'kurerskaya-sluzhba-s-dogovorami-v-hayfe', public_title = 'Курьерская служба с договорами в Хайфе', city_id = (SELECT id FROM cities WHERE slug = 'haifa'), area_note = 'промзона Чек-Пост', short_description = 'Доставка по Гуш-Дану для интернет-магазинов: 25 постоянных клиентов, свои курьеры.', description = 'Служба доставки по центру страны.

- 25 интернет-магазинов на постоянных договорах;
- 6 курьеров и диспетчерская программа;
- склад-пункт выдачи в промзоне.', updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE lot_number = 1010 AND internal_notes LIKE 'ДЕМО%';
