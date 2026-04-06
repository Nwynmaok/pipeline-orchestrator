#!/bin/bash
# Send a message via Telegram Bot API
# Usage: scripts/telegram-send.sh "<message>"
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from environment,
# or falls back to config.yaml values.

set -euo pipefail

MESSAGE="${1:-}"

if [[ -z "$MESSAGE" ]]; then
  echo "Usage: telegram-send.sh \"<message>\"" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Read from config if env vars not set
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  if command -v python3 &>/dev/null && [[ -f "$REPO_DIR/config.yaml" ]]; then
    eval "$(python3 -c "
import yaml, os
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
tg = c.get('telegram', {})
token = tg.get('botToken', '')
# Resolve env var references like \${TELEGRAM_BOT_TOKEN}
if token.startswith('\${') and token.endswith('}'):
    token = os.environ.get(token[2:-1], '')
chat_id = tg.get('chatId', '')
print(f'TELEGRAM_BOT_TOKEN=\"{token}\"')
print(f'TELEGRAM_CHAT_ID=\"{chat_id}\"')
" 2>/dev/null || echo "")"
  fi
fi

TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_CHAT_ID:-}"

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN not set" >&2
  exit 1
fi

if [[ -z "$CHAT_ID" ]]; then
  echo "ERROR: TELEGRAM_CHAT_ID not set" >&2
  exit 1
fi

# Telegram messages have a 4096 character limit
# If the message is longer, split into chunks
MAX_LEN=4096

if [[ ${#MESSAGE} -le $MAX_LEN ]]; then
  curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    -d chat_id="${CHAT_ID}" \
    -d text="${MESSAGE}" \
    -d parse_mode="Markdown" > /dev/null
  echo "Telegram message sent (${#MESSAGE} chars)"
else
  # Split by double newlines (paragraph breaks) to stay under limit
  CHUNK=""
  PART=1
  while IFS= read -r line; do
    if [[ $(( ${#CHUNK} + ${#line} + 1 )) -gt $MAX_LEN ]]; then
      curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        -d chat_id="${CHAT_ID}" \
        -d text="${CHUNK}" \
        -d parse_mode="Markdown" > /dev/null
      echo "Telegram message sent (part $PART, ${#CHUNK} chars)"
      CHUNK=""
      PART=$((PART + 1))
    fi
    CHUNK="${CHUNK}${line}\n"
  done <<< "$MESSAGE"
  if [[ -n "$CHUNK" ]]; then
    curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
      -d chat_id="${CHAT_ID}" \
      -d text="${CHUNK}" \
      -d parse_mode="Markdown" > /dev/null
    echo "Telegram message sent (part $PART, ${#CHUNK} chars)"
  fi
fi
