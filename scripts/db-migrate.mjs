// Миграции Postgres для DATABASE_URL (из .env или окружения).
//   npm run db:migrate          → migrations/*.sql (журнал drizzle.__drizzle_migrations)
//   npm run db:seed             → то же + справочники, тестовые лоты и их фото (только локально!)
// В production (Supabase) миграции применяются вручную: Supabase → SQL Editor или коннектор Supabase.
import { readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadEnv } from './load-env.mjs';

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Нужен DATABASE_URL (см. .env.example)');
  process.exit(1);
}
const seed = process.argv.includes('--seed');
if (seed && /supabase\.(co|com)/.test(url)) {
  console.error('Тестовые данные нельзя загружать в Supabase — только в локальную базу');
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: 'migrations' });
console.log('✓ миграции');
if (seed) {
  for (const f of ['seed/dictionaries.sql', 'seed/test-lots.sql']) {
    await client.unsafe(readFileSync(f, 'utf8'));
    console.log(`✓ ${f}`);
  }
  // Фото тестовых лотов: seed/photos/1001-0-1600.webp → <PHOTOS_DIR>/lots/1001/seed-0-1600.webp
  const dir = process.env.PHOTOS_DIR || '.data/photos';
  for (const name of readdirSync('seed/photos').filter((n) => n.endsWith('.webp'))) {
    const [lot, i, size] = name.replace('.webp', '').split('-');
    mkdirSync(`${dir}/lots/${lot}`, { recursive: true });
    copyFileSync(`seed/photos/${name}`, `${dir}/lots/${lot}/seed-${i}-${size}.webp`);
  }
  console.log(`✓ фото → ${dir}`);
}
await client.end();
