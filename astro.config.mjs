// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  // Сессии Astro не используются (KV не нужен).
  session: false,
  adapter: cloudflare({
    // Фото уже сжаты в браузере администратора и раздаются из R2 как есть.
    imageService: 'passthrough',
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Все страницы и API отдаёт Worker; без лишнего завершающего слеша.
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
  security: { checkOrigin: false },
});
