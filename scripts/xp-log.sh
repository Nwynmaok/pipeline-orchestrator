#!/bin/bash
# Log an XP event to agent-events.jsonl
# Usage: scripts/xp-log.sh <agent> <event> <project> "<note>"
#
# Valid events and XP values:
#   clean_pass_review: +25
#   clean_pass_qa: +30
#   bug_found_by_reviewer: -10
#   bug_found_by_qa: -15
#   rule_learned: +15
#   blocker_detected_early: +20
#   successful_deploy: +35
#   feature_implemented: +20
#   bug_fixed: +15

set -euo pipefail

AGENT="${1:-}"
EVENT="${2:-}"
PROJECT="${3:-}"
NOTE="${4:-}"

if [[ -z "$AGENT" || -z "$EVENT" || -z "$PROJECT" ]]; then
  echo "Usage: xp-log.sh <agent> <event> <project> \"<note>\"" >&2
  exit 1
fi

# XP lookup
declare -A XP_VALUES=(
  [clean_pass_review]=25
  [clean_pass_qa]=30
  [bug_found_by_reviewer]=-10
  [bug_found_by_qa]=-15
  [rule_learned]=15
  [blocker_detected_early]=20
  [successful_deploy]=35
  [feature_implemented]=20
  [bug_fixed]=15
)

XP="${XP_VALUES[$EVENT]:-}"
if [[ -z "$XP" ]]; then
  echo "ERROR: Unknown event type: $EVENT" >&2
  echo "Valid events: ${!XP_VALUES[*]}" >&2
  exit 1
fi

# Resolve events file path from config or default
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Try to read pipeline dir from config.yaml
if command -v python3 &>/dev/null && [[ -f "$REPO_DIR/config.yaml" ]]; then
  PIPELINE_DIR=$(python3 -c "
import yaml, sys
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
print(c.get('pipeline',{}).get('dir',''))
" 2>/dev/null || echo "")
fi
PIPELINE_DIR="${PIPELINE_DIR:-/Users/wynclaw/.openclaw/shared/pipeline}"
EVENTS_FILE="$(dirname "$PIPELINE_DIR")/agent-events.jsonl"

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build JSON line
JSON=$(cat <<JSONEOF
{"ts":"$TS","agent":"$AGENT","event":"$EVENT","xp":$XP,"project":"$PROJECT","note":"$NOTE"}
JSONEOF
)

echo "$JSON" >> "$EVENTS_FILE"
echo "Logged: $AGENT $EVENT ($XP XP) for $PROJECT"
