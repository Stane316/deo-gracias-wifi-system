#!/usr/bin/env bash
# IMP-09 — Applique/rollback les migrations Supabase (SQL pur, sans Docker ni CLI).
# Usage :
#   DATABASE_URL=postgres://user:pass@host:5432/db tools/db-migrate.sh up     # applique 0001→000N
#   DATABASE_URL=...                        tools/db-migrate.sh down   # rollback 000N→0001
#   DATABASE_URL=...                        tools/db-migrate.sh reset  # down puis up
#   DATABASE_URL=...                        tools/db-migrate.sh smoke  # assertions de schéma
# CI : job « db-migrations » (.github/workflows/ci.yml) sur service container Postgres.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL requis (ex. postgres://postgres:postgres@localhost:5432/postgres)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/supabase/migrations"
DOWN="$ROOT/supabase/down"

psql_run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

cmd="${1:-up}"

case "$cmd" in
  up)
    for f in $(ls "$MIG"/*.sql | sort); do
      echo "== up  $(basename "$f")"
      psql_run -f "$f"
    done
    ;;
  down)
    for f in $(ls "$DOWN"/*.sql | sort -r); do
      echo "== down $(basename "$f")"
      psql_run -f "$f"
    done
    ;;
  reset)
    "$0" down
    "$0" up
    ;;
  smoke)
    psql_run -f "$ROOT/tools/db-smoke.sql"
    ;;
  *)
    echo "usage: $0 {up|down|reset|smoke}" >&2
    exit 2
    ;;
esac
echo "OK: $cmd"
