import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // В юнит-тестах модуль Cloudflare не нужен.
      'cloudflare:workers': new URL('./tests/stubs/cloudflare-workers.ts', import.meta.url).pathname,
    },
  },
});
