#!/usr/bin/env bash
# Локальный Postgres для разработки и сквозных тестов: кластер в .data/pg, порт 54329, без пароля.
#   npm run db:local   → запустить (при первом запуске — создать кластер и базу bmarket)
set -euo pipefail
cd "$(dirname "$0")/.."
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
PGBIN=${PGBIN:-$(dirname "$(command -v pg_ctl)")}
DATA=.data/pg
PORT=${PGPORT:-54329}
mkdir -p "$DATA"
# Postgres не запускается от root (например, в контейнере) — тогда от пользователя postgres.
AS=()
if [ "$(id -u)" = 0 ]; then chown postgres "$DATA" && chmod 700 "$DATA" && AS=(runuser -u postgres --); fi
if [ ! -f "$DATA/PG_VERSION" ]; then
  "${AS[@]}" "$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
fi
if ! "${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  "${AS[@]}" "$PGBIN/pg_ctl" -D "$DATA" -l "$DATA/../pg.log" -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" -w start >/dev/null
fi
psql -h 127.0.0.1 -p "$PORT" -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bmarket'" | grep -q 1 \
  || psql -h 127.0.0.1 -p "$PORT" -U postgres -qc "CREATE DATABASE bmarket"
echo "Postgres: postgres://postgres@127.0.0.1:$PORT/bmarket"
