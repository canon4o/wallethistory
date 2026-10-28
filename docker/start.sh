#!/bin/sh
# Container entrypoint: builds DATABASE_URL / REDIS_URL from the plain passwords (URL-encoded, so
# characters like @ / : # % are safe), applies migrations, then starts the app. An explicit
# DATABASE_URL or REDIS_URL (even an empty REDIS_URL) is used as given.
set -e

enc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

if [ -z "$DATABASE_URL" ]; then
  if [ -z "$POSTGRES_PASSWORD" ]; then
    echo "Set POSTGRES_PASSWORD (or DATABASE_URL)" >&2
    exit 1
  fi
  DATABASE_URL="postgres://${POSTGRES_USER:-wallethistory}:$(enc "$POSTGRES_PASSWORD")@${POSTGRES_HOST:-db}:5432/${POSTGRES_DB:-wallethistory}"
  export DATABASE_URL
fi

if [ -z "${REDIS_URL+x}" ] && [ -n "$REDIS_PASSWORD" ]; then
  REDIS_URL="redis://:$(enc "$REDIS_PASSWORD")@${REDIS_HOST:-redis}:6379"
  export REDIS_URL
fi

node docker/migrate.mjs
exec node server.js
