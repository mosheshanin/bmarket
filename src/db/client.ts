import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

/**
 * Подключение к Postgres (Supabase) через пулер Supavisor в режиме transaction (порт 6543),
 * поэтому подготовленные запросы выключены. Одно подключение на экземпляр функции Vercel:
 * при Fluid compute экземпляр обслуживает много запросов подряд.
 *
 * bigint (count, метки времени в мс, Telegram ID) и numeric (sum) отдаются числами, как было в D1:
 * все значения в проекте меньше 2^53.
 */
const toNumber = (x: string) => Number(x);

export function createDb(url: string) {
  const client = postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 10,
    types: {
      int8: { to: 20, from: [20], serialize: (x: number | bigint) => String(x), parse: toNumber },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: toNumber },
    },
  });
  return drizzle(client, { schema });
}

export type DB = ReturnType<typeof createDb>;

let shared: DB | null = null;
let sharedUrl = '';

/** Общее подключение процесса (создаётся при первом обращении). */
export function getDb(url: string): DB {
  if (!url) throw new Error('DATABASE_URL не задан');
  if (!shared || sharedUrl !== url) {
    shared = createDb(url);
    sharedUrl = url;
  }
  return shared;
}

export { schema };
