#!/bin/bash
# Create a new project in the pipeline
# Usage: scripts/pipeline-start.sh <project-name>

set -euo pipefail

PROJECT="${1:-}"

if [[ -z "$PROJECT" ]]; then
  echo "Usage: pipeline-start.sh <project-name>" >&2
  exit 1
fi

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

PROJECT_DIR="$PIPELINE_DIR/$PROJECT"

if [[ -d "$PROJECT_DIR" ]]; then
  echo "ERROR: Project directory already exists: $PROJECT_DIR" >&2
  exit 1
fi

mkdir -p "$PROJECT_DIR"

# Create TRACKER.md
cat > "$PROJECT_DIR/TRACKER.md" << TRACKER
# Project Tracker: $PROJECT

## Overall Status: Not Started

## Stages

| Stage | Status | Artifact |
|---|---|---|
| Requirements | Not Started | -- |
| Design | Not Started | -- |
| Implementation | Not Started | -- |
| Review | Not Started | -- |
| QA | Not Started | -- |
| Deploy | Not Started | -- |

## Intake Notes

<!-- Add project description and requirements here -->

TRACKER

# Create PHASE.md
cat > "$PROJECT_DIR/PHASE.md" << PHASE
# Phase Tracking: $PROJECT

## Current Phase: 1

## Phase History

### Phase 1
- **Scope:** Initial implementation
- **Started:** $(date +%Y-%m-%d)
PHASE

echo "Project created: $PROJECT_DIR"
echo "  - TRACKER.md created (add intake notes to trigger PM)"
echo "  - PHASE.md created (Phase 1)"
echo ""
echo "Next: Add intake notes to TRACKER.md. The PM agent will pick it up on the next scheduled run."
echo "To trigger immediately: scripts/pipeline-kick.sh pm"
