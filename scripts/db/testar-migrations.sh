#!/usr/bin/env bash
# Aplica todas as migrations num Postgres local descartável e roda os testes de
# banco (supabase/tests/*.sql). Uso: scripts/db/testar-migrations.sh
#
# Precisa de initdb/pg_ctl/psql (Postgres 15+) no PATH ou em PG_BIN.
# As extensões do Supabase (pg_cron, pg_net, pgvector, vault) são imitadas por
# scripts/db/shim-supabase.sql: o teste valida o SQL das migrations e as regras
# de negócio, não o comportamento dessas extensões.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
DIR="$(mktemp -d)"
PORTA="${PG_PORTA:-54329}"

if [ "$(id -u)" = "0" ]; then
  # initdb não roda como root: usa um usuário sem privilégio.
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown -R postgres "$DIR"
  COMO=(runuser -u postgres --)
else
  COMO=()
fi

trap '"${COMO[@]}" "$PG_BIN/pg_ctl" -D "$DIR/dados" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"${COMO[@]}" "$PG_BIN/initdb" -D "$DIR/dados" -U postgres -A trust --locale=C.UTF-8 >/dev/null
"${COMO[@]}" "$PG_BIN/pg_ctl" -D "$DIR/dados" -o "-p $PORTA -k $DIR -c timezone=UTC" -l "$DIR/log" -w start >/dev/null

PSQL=(psql -h "$DIR" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$RAIZ/scripts/db/shim-supabase.sql" >/dev/null 2>&1

for f in "$RAIZ"/supabase/migrations/*.sql; do
  # Extensões imitadas pelo shim; o índice HNSW não existe sem pgvector.
  sed -E \
    -e 's/^\s*create extension if not exists (pg_cron|pg_net|vector)[^;]*;//I' \
    -e 's/extensions\.vector\([0-9]+\)/extensions.vector/g' \
    -e 's/using hnsw \(embedding extensions\.vector_cosine_ops\)/(id)/' \
    "$f" > "$DIR/m.sql"
  # Ajustes de ordem para migrations geradas fora de sequência (ver preludios/).
  if [ -f "$RAIZ/scripts/db/preludios/$(basename "$f")" ]; then
    cat "$RAIZ/scripts/db/preludios/$(basename "$f")" "$DIR/m.sql" > "$DIR/m2.sql" && mv "$DIR/m2.sql" "$DIR/m.sql"
  fi
  if ! "${PSQL[@]}" -f "$DIR/m.sql" >"$DIR/saida" 2>&1; then
    echo "✗ migration $(basename "$f")"
    cat "$DIR/saida"
    exit 1
  fi
done
echo "✓ $(ls "$RAIZ"/supabase/migrations/*.sql | wc -l) migrations aplicadas"

falhas=0
for t in "$RAIZ"/supabase/tests/*.sql; do
  [ -e "$t" ] || continue
  if "${PSQL[@]}" -f "$t" >"$DIR/saida" 2>&1; then
    echo "✓ $(basename "$t")"
  else
    echo "✗ $(basename "$t")"
    cat "$DIR/saida"
    falhas=1
  fi
done
exit $falhas
