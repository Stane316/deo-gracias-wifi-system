#!/usr/bin/env bash
# IMP-09 — Applique/rollback les migrations Supabase (SQL pur, sans Docker ni CLI).
# FIX 17/09 (échec CI pg16/17) : gardes explicites — un dossier vide/manquant est une
# ERREUR franche, jamais un no-op silencieux (l'ancien comportement laissait passer
# un « down » qui ne supprimait rien, puis le « up » suivant échouait).
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

count_sql() { find "$1" -maxdepth 1 -name '*.sql' -type f 2>/dev/null | wc -l | tr -d ' '; }

cmd="${1:-up}"

case "$cmd" in
  up)
    n="$(count_sql "$MIG")"
    if [ "$n" -eq 0 ]; then
      echo "ERREUR: aucun fichier de migration dans $MIG — cycle interrompu (pas de no-op)." >&2
      exit 1
    fi
    for f in $(ls "$MIG"/*.sql | sort); do
      echo "== up  $(basename "$f")"
      psql_run -f "$f"
    done
    echo "OK: up ($n migrations appliquées)"
    ;;
  down)
    n="$(count_sql "$DOWN")"
    if [ "$n" -eq 0 ]; then
      echo "ERREUR: aucun fichier de rollback dans $DOWN — réversibilité impossible, cycle interrompu (pas de no-op)." >&2
      exit 1
    fi
    for f in $(ls "$DOWN"/*.sql | sort -r); do
      echo "== down $(basename "$f")"
      psql_run -f "$f"
    done
    echo "OK: down ($n rollbacks appliqués)"
    ;;
  reset)
    "$0" down
    "$0" up
    ;;
  smoke)
    psql_run -f "$ROOT/tools/db-smoke.sql"
    echo "OK: smoke"
    ;;
  rls)
    psql_run -f "$ROOT/tools/db-rls-tests.sql"
    echo "OK: rls"
    ;;
  states)
    psql_run -f "$ROOT/tools/db-state-tests.sql"
    echo "OK: states"
    ;;
  *)
    echo "usage: $0 {up|down|reset|smoke|rls|states}" >&2
    exit 2
    ;;
esac
