import { defineConfig } from 'drizzle-kit';

// Миграции Postgres (Supabase) генерируются drizzle-kit:
//   npm run db:generate  → migrations/*.sql
//   npm run db:migrate   → применить к DATABASE_URL (локально; в production — через Supabase)
// Старые миграции D1 (SQLite) сохранены в migrations-d1/ для истории.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
});
