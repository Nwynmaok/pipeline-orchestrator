#!/bin/bash
# Poll for incoming Telegram messages and process replies to sync messages.
# When Nathan replies to a sync message with a clarification, this script:
#   1. Writes context-{slug}.md in the relevant project directory
#   2. Deletes needs-clarification.md to unblock the pipeline
#   3. Sends a confirmation message back to Telegram
#
# Usage: scripts/telegram-poll.sh
# Designed to run on a frequent schedule (e.g. every 5 minutes).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
OFFSET_FILE="$REPO_DIR/data/telegram-offset.txt"

# --- Load config (same pattern as telegram-send.sh) ---

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  if command -v python3 &>/dev/null && [[ -f "$REPO_DIR/config.yaml" ]]; then
    eval "$(python3 -c "
import yaml, os
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
tg = c.get('telegram', {})
token = tg.get('botToken', '')
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

# --- Load pipeline directory ---

PIPELINE_DIR=$(python3 -c "
import yaml
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
print(c.get('pipeline',{}).get('dir',''))
" 2>/dev/null || echo "")
PIPELINE_DIR="${PIPELINE_DIR:-/Users/wynclaw/.openclaw/shared/pipeline}"

# --- Read offset ---

if [[ -f "$OFFSET_FILE" ]]; then
  OFFSET=$(cat "$OFFSET_FILE")
else
  OFFSET=0
fi

# --- Poll for updates ---

RESPONSE=$(curl -s "https://api.telegram.org/bot${TOKEN}/getUpdates?offset=${OFFSET}&timeout=0")

# --- Process updates ---

export _TG_RESPONSE="$RESPONSE"
export _TG_CHAT_ID="$CHAT_ID"
export _TG_PIPELINE_DIR="$PIPELINE_DIR"
export _TG_OFFSET_FILE="$OFFSET_FILE"
export _TG_SCRIPT_DIR="$SCRIPT_DIR"

python3 << 'PYEOF'
import json
import os
import sys
from datetime import datetime

response_json = os.environ["_TG_RESPONSE"]
expected_chat_id = os.environ["_TG_CHAT_ID"]
pipeline_dir = os.environ["_TG_PIPELINE_DIR"]
offset_file = os.environ["_TG_OFFSET_FILE"]
script_dir = os.environ["_TG_SCRIPT_DIR"]

data = json.loads(response_json)

if not data.get("ok"):
    print("ERROR: Telegram API returned error", file=sys.stderr)
    sys.exit(1)

results = data.get("result", [])

if not results:
    sys.exit(0)

# Update offset to highest update_id + 1
max_update_id = max(r["update_id"] for r in results)
with open(offset_file, "w") as f:
    f.write(str(max_update_id + 1))

# Find projects with needs-clarification.md
def find_clarification_projects():
    projects = {}
    if not os.path.isdir(pipeline_dir):
        return projects
    for entry in os.listdir(pipeline_dir):
        project_path = os.path.join(pipeline_dir, entry)
        nc_file = os.path.join(project_path, "needs-clarification.md")
        if os.path.isdir(project_path) and os.path.isfile(nc_file):
            projects[entry] = nc_file
    return projects

def send_telegram(message):
    import subprocess
    subprocess.run(
        [os.path.join(script_dir, "telegram-send.sh"), message],
        check=False
    )

for update in results:
    msg = update.get("message", {})

    # Only process messages from Nathan's chat
    chat_id = str(msg.get("chat", {}).get("id", ""))
    if chat_id != expected_chat_id:
        continue

    text = msg.get("text", "").strip()
    if not text:
        continue

    # Only process replies (messages with reply_to_message)
    if "reply_to_message" not in msg:
        continue

    # Find projects that need clarification
    projects = find_clarification_projects()

    if len(projects) == 0:
        # No projects need clarification — ignore the reply
        continue

    if len(projects) == 1:
        # Unambiguous — route to the single project
        project_name = list(projects.keys())[0]
        nc_file = projects[project_name]

        # Derive slug from project directory name
        slug = project_name

        # Write context-{slug}.md
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M PT")
        context_content = f"""# Context: {project_name}
**Source:** Telegram reply from Nathan
**Date:** {timestamp}

## Clarification

{text}
"""
        context_path = os.path.join(pipeline_dir, project_name, f"context-{slug}.md")
        with open(context_path, "w") as f:
            f.write(context_content)

        # Delete needs-clarification.md
        os.remove(nc_file)

        print(f"Resolved: {project_name} — wrote context-{slug}.md, deleted needs-clarification.md")

        # Send confirmation
        send_telegram(f"✅ Got it — clarification written to *{project_name}* and pipeline unblocked.")

    else:
        # Ambiguous — multiple projects need clarification
        project_list = "\n".join(f"• {p}" for p in sorted(projects.keys()))
        send_telegram(
            f"🤔 Multiple projects need clarification:\n\n{project_list}\n\n"
            f"Which project is this reply for? Reply with the project name."
        )

        # Check if the reply text matches a project name
        matched = None
        for p in projects:
            if p.lower() in text.lower():
                matched = p
                break

        if matched:
            slug = matched
            nc_file = projects[matched]

            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M PT")
            context_content = f"""# Context: {matched}
**Source:** Telegram reply from Nathan
**Date:** {timestamp}

## Clarification

{text}
"""
            context_path = os.path.join(pipeline_dir, matched, f"context-{slug}.md")
            with open(context_path, "w") as f:
                f.write(context_content)

            os.remove(nc_file)
            print(f"Resolved (matched by name): {matched} — wrote context-{slug}.md, deleted needs-clarification.md")
            send_telegram(f"✅ Matched to *{matched}* — clarification written and pipeline unblocked.")
PYEOF
