# Логотипы рекламных площадок (`public/brands/`)

Иконки рекламных площадок для промо-блока «Ваше объявление заметят» — файлы с Wikimedia Commons
(лицензия: Public domain, простые знаки не охраняются авторским правом; товарные знаки принадлежат владельцам):
- google.svg — https://commons.wikimedia.org/wiki/File:Google_%22G%22_logo.svg
- facebook.svg — https://commons.wikimedia.org/wiki/File:Facebook_f_logo_(2019).svg (убраны служебные метаданные CorelDRAW)
- yandex.svg — https://commons.wikimedia.org/wiki/File:Yandex_icon.svg
Используются только для указания, где идёт реклама каталога; форма и цвета не менялись.

# Логотип BMarket (`public/logo.svg`, `public/favicon.svg`, `src/lib/logo-path.ts`)

С 14.11.2026 (DECISIONS №47). Надпись BMarket — контуры шрифта Nunito Black 900 (SIL Open Font License, `@fontsource-variable/nunito`),
фон — градиент заставки мини-приложения: фиолетовый `#7c4dee`/`#b45cfa` → тёмно-синий `#1c2a6c` → голубой `#0ea5e9`.
`favicon.svg` — буква B на том же фоне; `apple-touch-icon.png` (180) и `icon-512.png` (логотип для разметки Organization) —
растровые копии, пересобираются `rsvg-convert -w 512 public/favicon.svg -o public/icon-512.png`.

# 3D-иконки (`public/icons3d/`)

Microsoft Fluent Emoji, стиль 3D — https://github.com/microsoft/fluentui-emoji, **лицензия MIT** (Copyright (c) Microsoft Corporation),
коммерческое использование разрешено. Исходники 256×256 PNG уменьшены до 128×128 WebP (≈5 КБ каждая).
Имя файла = имя эмодзи в репозитории (`assets/Money bag/3D/money_bag_3d.png` → `money-bag.webp`). Вывод — компонент `src/components/Icon3D.astro`.
Новую иконку: найти папку в `assets/`, взять файл из `3D/`, уменьшить до 128 px и сохранить в WebP.
Альтернатива — 3dicons.co (CC0, 1440+ иконок, есть стиль «gradient» в фиолетово-синих тонах): из среды ассистента их CDN недоступен.
