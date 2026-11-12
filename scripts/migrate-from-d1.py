#!/usr/bin/env python3
"""
Перенос данных из Cloudflare D1 (выгрузка `wrangler d1 export`) в Postgres (Supabase).

  python3 scripts/migrate-from-d1.py d1.sql out.sql
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -1 -f out.sql

Выгрузка загружается во временную SQLite-базу, затем каждая строка переписывается в INSERT
с типами из схемы Postgres (boolean, jsonb, bigint). Перед вставкой таблицы очищаются, поэтому
перенос можно повторять (пробный → финальный). Служебные ключи settings (cron_secret и т. п.) не трогаются.
Типы колонок берутся из migrations/0000_init.sql.
"""
import json, re, sqlite3, sys

src, out = sys.argv[1], sys.argv[2]

# Порядок вставки — с учётом внешних ключей.
TABLES = ['cities', 'categories', 'businesses', 'business_photos', 'leads', 'subscribers', 'exchange_rates',
          'events', 'audit_log', 'broadcasts', 'payments', 'edit_requests', 'visitor_profiles', 'settings']
# Ключи settings, которые относятся к Cloudflare или создаются заново на Vercel.
SKIP_SETTINGS = {'bot_setup', 'cron_secret', 'cron_minute_lease'}

# Типы колонок Postgres из миграции.
pg_types = {}
init = open('migrations/0000_init.sql', encoding='utf-8').read()
for m in re.finditer(r'CREATE TABLE "(\w+)" \((.*?)\n\);', init, re.S):
    cols = {}
    for line in m.group(2).split('\n'):
        c = re.match(r'\s*"(\w+)" (\w+(?: precision)?)', line)
        if c:
            cols[c.group(1)] = c.group(2)
    pg_types[m.group(1)] = cols
assert set(TABLES) <= set(pg_types), set(TABLES) - set(pg_types)

db = sqlite3.connect(':memory:')
dump = open(src, encoding='utf-8').read()
# В выгрузке D1 бывают служебные строки PRAGMA и таблицы _cf_*: SQLite их принимает.
db.executescript(dump)


def lit(v, t):
    if v is None:
        return 'NULL'
    if t == 'boolean':
        return 'true' if v in (1, '1', True, 'true') else 'false'
    if t in ('integer', 'bigint'):
        return str(int(v))
    if t == 'double precision':
        return repr(float(v))
    if t == 'jsonb':
        s = v if isinstance(v, str) else json.dumps(v)
        json.loads(s)  # проверка
        return "'" + s.replace("'", "''") + "'::jsonb"
    if isinstance(v, bytes):
        v = v.decode('utf-8')
    return "'" + str(v).replace("'", "''") + "'"


lines = ['SET client_min_messages = warning;', 'BEGIN;']
lines.append('TRUNCATE ' + ', '.join(t for t in TABLES if t != 'settings') + ' RESTART IDENTITY CASCADE;')
lines.append("DELETE FROM settings WHERE key NOT IN (" + ', '.join(f"'{k}'" for k in sorted(SKIP_SETTINGS)) + ');')
counts = {}
for t in TABLES:
    try:
        cur = db.execute(f'SELECT * FROM "{t}"')
    except sqlite3.OperationalError:
        counts[t] = 0
        continue
    names = [d[0] for d in cur.description]
    types = pg_types[t]
    cols = [n for n in names if n in types]
    missing = [n for n in names if n not in types]
    if missing:
        sys.exit(f'{t}: колонки {missing} есть в D1, но нет в Postgres')
    n = 0
    for row in cur:
        rec = dict(zip(names, row))
        if t == 'settings' and rec['key'] in SKIP_SETTINGS:
            continue
        vals = ', '.join(lit(rec[c], types[c]) for c in cols)
        lines.append(f'INSERT INTO "{t}" (' + ', '.join(f'"{c}"' for c in cols) + f') VALUES ({vals});')
        n += 1
    counts[t] = n
    if 'id' in types:
        lines.append(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), coalesce((SELECT max(id) FROM \"{t}\"), 0) + 1, false);")

report = json.dumps({'source_rows': counts}, ensure_ascii=False)
lines.append("INSERT INTO settings (key, value) VALUES ('migration_report', " + lit(report, 'text') +
             ") ON CONFLICT (key) DO UPDATE SET value = excluded.value;")
lines.append('COMMIT;')
open(out, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(report)
