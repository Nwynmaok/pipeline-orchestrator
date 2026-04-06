#!/bin/bash
# Show recent run history for an agent
# Usage: scripts/pipeline-logs.sh [agent] [--lines N]

set -euo pipefail

AGENT="${1:-}"
LINES=20

# Parse args
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lines)
      LINES="${2:-20}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
RUN_LOG="$REPO_DIR/data/run-log.jsonl"

if [[ ! -f "$RUN_LOG" ]]; then
  echo "No run log found at $RUN_LOG"
  echo "Agents append to this file after each execution."
  exit 0
fi

echo "=== Pipeline Run Log ==="
if [[ -n "$AGENT" ]]; then
  echo "Agent: $AGENT (last $LINES entries)"
  echo ""
  grep "\"agent\":\"$AGENT\"" "$RUN_LOG" | tail -n "$LINES" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    entry = json.loads(line)
    ts = entry.get('ts', '?')
    project = entry.get('project', '?')
    trigger = entry.get('trigger', '?')
    condition = entry.get('condition', '')
    artifacts = entry.get('artifactsWritten', [])
    valid = entry.get('validationPassed', None)
    valid_str = 'PASS' if valid else ('FAIL' if valid is False else '-')
    artifacts_str = ', '.join(artifacts) if artifacts else 'none'
    print(f'  {ts}  [{trigger}]  {project}')
    print(f'    Condition: {condition}')
    print(f'    Wrote: {artifacts_str}  Validation: {valid_str}')
    print()
" 2>/dev/null || tail -n "$LINES" "$RUN_LOG"
else
  echo "All agents (last $LINES entries)"
  echo ""
  tail -n "$LINES" "$RUN_LOG" | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    entry = json.loads(line)
    ts = entry.get('ts', '?')
    agent = entry.get('agent', '?')
    project = entry.get('project', '?')
    trigger = entry.get('trigger', '?')
    artifacts = entry.get('artifactsWritten', [])
    artifacts_str = ', '.join(artifacts) if artifacts else 'none'
    print(f'  {ts}  {agent:<12}  [{trigger}]  {project}  ->  {artifacts_str}')
" 2>/dev/null || tail -n "$LINES" "$RUN_LOG"
fi
