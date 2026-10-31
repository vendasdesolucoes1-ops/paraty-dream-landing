#!/usr/bin/env bash
# Carga inicial da integração Meta: chama a Edge Function meta-backfill em laço
# até concluir (cada chamada avança o quanto o tempo da função permite).
#
# Uso:
#   SUPABASE_URL=https://<projeto>.supabase.co \
#   META_CRON_SECRET=<valor de cron_meta_secret> \
#   scripts/meta/carga-inicial.sh [ads|instagram] [--reiniciar] [--meses N]
#
# O valor do segredo (só admin, no SQL Editor):
#   select decrypted_secret from vault.decrypted_secrets where name = 'cron_meta_secret';
# Não imprime nem grava o segredo em nenhum lugar.
set -euo pipefail

ESCOPO="ads"
EXTRA=""
while [ $# -gt 0 ]; do
  case "$1" in
    ads|instagram) ESCOPO="$1" ;;
    --reiniciar) EXTRA="$EXTRA&reiniciar=1" ;;
    --meses) shift; EXTRA="$EXTRA&meses=$1" ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
  shift
done

: "${SUPABASE_URL:?defina SUPABASE_URL}"
: "${META_CRON_SECRET:?defina META_CRON_SECRET}"

URL="$SUPABASE_URL/functions/v1/meta-backfill?escopo=$ESCOPO$EXTRA"
MAX_CHAMADAS="${MAX_CHAMADAS:-60}"

for i in $(seq 1 "$MAX_CHAMADAS"); do
  RESP="$(curl -sS --max-time 170 -X POST "$URL" -H "x-internal-secret: $META_CRON_SECRET" -H "Content-Type: application/json" -d '{}')"
  echo "[$i] $RESP"
  # A partir da 2ª chamada o cursor salvo continua; --reiniciar só vale na 1ª.
  URL="${URL//&reiniciar=1/}"
  if echo "$RESP" | grep -q '"ok":false'; then
    echo "Falhou: veja o erro acima e meta_sync_execucoes. Rode de novo para retomar." >&2
    exit 1
  fi
  if echo "$RESP" | grep -q '"concluido":true'; then
    echo "Carga inicial concluída."
    exit 0
  fi
  sleep 2
done
echo "Limite de $MAX_CHAMADAS chamadas atingido; rode de novo para continuar de onde parou." >&2
exit 3
