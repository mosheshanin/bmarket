// Загрузить .env в process.env (без зависимостей). Уже заданные переменные не перезаписываются.
import { existsSync, readFileSync } from 'node:fs';

export function loadEnv(file = '.env') {
  if (!existsSync(file)) return {};
  const vars = Object.fromEntries(
    readFileSync(file, 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined) process.env[k] = v;
  return vars;
}
