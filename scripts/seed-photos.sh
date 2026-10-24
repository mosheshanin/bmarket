#!/usr/bin/env bash
# Загрузить фото тестовых лотов в R2.
#   локально:  bash scripts/seed-photos.sh --local
#   staging:   bash scripts/seed-photos.sh --remote --env staging   (бакет bmarket-photos-staging)
set -euo pipefail
BUCKET="bmarket-photos"
if [[ " $* " == *" staging "* ]]; then BUCKET="bmarket-photos-staging"; fi
cd "$(dirname "$0")/.."
for f in seed/photos/*.webp; do
  name=$(basename "$f" .webp)          # 1001-0-1600
  lot=${name%%-*}
  rest=${name#*-}                      # 0-1600
  i=${rest%%-*}
  size=${rest#*-}
  key="lots/${lot}/seed-${i}-${size}.webp"
  npx wrangler r2 object put "${BUCKET}/${key}" --file "$f" --content-type image/webp \
    --cache-control "public, max-age=31536000, immutable" "$@" >/dev/null
  echo "↑ ${key}"
done
