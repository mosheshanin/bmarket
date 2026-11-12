// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  // Сессии Astro не используются.
  session: false,
  // Vercel Functions на Node.js (не edge: grammY и postgres.js), регион — рядом с базой Supabase (Франкфурт).
  adapter: vercel({
    // Фото уже сжаты в браузере администратора и раздаются как есть.
    imageService: false,
    webAnalytics: { enabled: false },
    maxDuration: 60,
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Без лишнего завершающего слеша.
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
  security: { checkOrigin: false },
});
