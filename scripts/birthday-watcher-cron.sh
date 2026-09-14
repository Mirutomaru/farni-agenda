#!/usr/bin/env bash
# FARNÍ AGENDA - FREE CRON JOB SCRIPT (birthday-watcher)
# Spuštěno externím cronem (např. cron-job.org nebo Linux crontab)
# Náhrada za Firebase Functions → Supabase Edge Function

set -e  # Exit on error

SUPABASE_URL="${SUPABASE_URL:-https://your-project.supabase.co}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-your-service-key-here}"
EDGE_FUNCTION_URL="${SUPABASE_URL}/functions/v1/birthday-watcher"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Birthday Watcher cron started..."

# Volání Edge Function (pouze POST, žádné env vars v URL pro bezpečnost)
RESPONSE=$(curl -s -X POST "$EDGE_FUNCTION_URL" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  --max-time 30)

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "[ERROR] Curl failed with code $EXIT_CODE" >&2
  exit 1
fi

echo "$RESPONSE" | jq . || echo "Invalid JSON response"

# Odeslání notifikace (např. přes webhook Discord/Telegram)
RESULT_COUNT=$(echo "$RESPONSE" | jq -r '.count // 0')
if [ "$RESULT_COUNT" != "0" ] && [ "$RESULT_COUNT" != "" ]; then
  echo "[INFO] Nalezeno $RESULT_COUNT osob s kulatými narozeninami." >&2
else
  echo "[INFO] Žádné narozeniny dnes."
fi

exit 0
