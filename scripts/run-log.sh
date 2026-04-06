#!/bin/bash
# Append a run log entry
# Usage: scripts/run-log.sh <agent> <project> <trigger> <condition> <artifacts_written> <validation_passed> "<note>"
# Example: scripts/run-log.sh backend restock-monitor scheduled "TDD exists, no impl" "impl-backend-restock-monitor.md" true "Initial impl"

set -euo pipefail

AGENT="${1:-}"
PROJECT="${2:-}"
TRIGGER="${3:-scheduled}"
CONDITION="${4:-}"
ARTIFACTS="${5:-}"
VALIDATION="${6:-true}"
NOTE="${7:-}"

if [[ -z "$AGENT" || -z "$PROJECT" ]]; then
  echo "Usage: run-log.sh <agent> <project> <trigger> <condition> <artifacts> <validation> \"<note>\"" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
RUN_LOG="$REPO_DIR/data/run-log.jsonl"

mkdir -p "$(dirname "$RUN_LOG")"

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Convert comma-separated artifacts to JSON array
if [[ -n "$ARTIFACTS" ]]; then
  ARTIFACTS_JSON=$(echo "$ARTIFACTS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip().split(',')))" 2>/dev/null || echo "[]")
else
  ARTIFACTS_JSON="[]"
fi

# Build JSON
JSON=$(python3 -c "
import json
print(json.dumps({
    'ts': '$TS',
    'agent': '$AGENT',
    'project': '$PROJECT',
    'trigger': '$TRIGGER',
    'condition': '$CONDITION',
    'artifactsWritten': $ARTIFACTS_JSON,
    'artifactsDeleted': [],
    'validationPassed': $VALIDATION,
    'note': '$NOTE'
}))
")

echo "$JSON" >> "$RUN_LOG"
echo "Run logged: $AGENT on $PROJECT ($TRIGGER)"
