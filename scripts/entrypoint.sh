#!/bin/sh
set -e

if [ "$SKIP_MIGRATIONS" != "true" ]; then
  echo "Waiting for database..."
  bun run src/db/wait-for-db.ts
  echo "Running database migrations..."
  bun run src/db/migrate.ts
  echo "Migrations completed."
fi

exec bun run src/index.ts
