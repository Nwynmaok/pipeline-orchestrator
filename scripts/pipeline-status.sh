#!/bin/bash
# Display pipeline dashboard
# Usage: scripts/pipeline-status.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Read pipeline dir from config
if command -v python3 &>/dev/null && [[ -f "$REPO_DIR/config.yaml" ]]; then
  PIPELINE_DIR=$(python3 -c "
import yaml
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
print(c.get('pipeline',{}).get('dir',''))
" 2>/dev/null || echo "")
fi
PIPELINE_DIR="${PIPELINE_DIR:-/Users/wynclaw/.openclaw/shared/pipeline}"

DASHBOARD="$PIPELINE_DIR/DASHBOARD.md"

if [[ -f "$DASHBOARD" ]]; then
  cat "$DASHBOARD"
else
  echo "No DASHBOARD.md found at $DASHBOARD"
  echo ""
  echo "Projects in pipeline directory:"
  if [[ -d "$PIPELINE_DIR" ]]; then
    for dir in "$PIPELINE_DIR"/*/; do
      if [[ -d "$dir" ]]; then
        project=$(basename "$dir")
        if [[ -f "$dir/TRACKER.md" ]]; then
          echo "  - $project (has TRACKER.md)"
        else
          echo "  - $project"
        fi
      fi
    done
  else
    echo "  Pipeline directory not found: $PIPELINE_DIR"
  fi
fi
