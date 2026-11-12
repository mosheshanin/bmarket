/**
 * Промо-блок «Ваше объявление заметят» на странице «Мои объявления».
 * Цифры и каналы — со слов владельца (25.10.2026); меняются здесь.
 * Иконки — официальные знаки с Wikimedia Commons (public domain), см. docs/BRAND-ASSETS.md.
 */
export const PROMO = {
  channels: [
    { name: 'Facebook', icon: '/brands/facebook.svg' },
    { name: 'Google', icon: '/brands/google.svg' },
    { name: 'Яндекс', icon: '/brands/yandex.svg' },
  ],
  monthlyVisitors: 6000,
  /** Клуб предпринимателей, участникам которого показываются объявления. */
  club: 'HaifaBusinessClub',
} as const;

/**
 * «от ₪ 70 000» — цифра владельца для заставки и шапки главной.
 * Если в каталоге появится лот дешевле, показывается его цена (fromPrice).
 */
export const CATALOG_FROM_PRICE = 70_000;
export function fromPrice(minPrice: number | null): number {
  return minPrice ? Math.min(minPrice, CATALOG_FROM_PRICE) : CATALOG_FROM_PRICE;
}
