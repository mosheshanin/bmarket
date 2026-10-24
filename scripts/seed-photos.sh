#!/usr/bin/env bash
# Загрузить фото тестовых лотов в хранилище фото (Workers KV, привязка PHOTOS_KV).
# Только для локальной разработки:  bash scripts/seed-photos.sh --local
set -euo pipefail
cd "$(dirname "$0")/.."
for f in seed/photos/*.webp; do
  name=$(basename "$f" .webp)          # 1001-0-1600
  lot=${name%%-*}
  rest=${name#*-}                      # 0-1600
  i=${rest%%-*}
  size=${rest#*-}
  key="lots/${lot}/seed-${i}-${size}.webp"
  npx wrangler kv key put --binding PHOTOS_KV "$key" --path "$f" --metadata '{"contentType":"image/webp"}' "$@" >/dev/null 2>&1
  echo "↑ ${key}"
done
