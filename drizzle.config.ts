import { defineConfig } from 'drizzle-kit';

// Миграции генерируются drizzle-kit, применяются wrangler:
//   npm run db:generate  → migrations/*.sql
//   npm run db:migrate:local | db:migrate:staging | db:migrate:prod
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
