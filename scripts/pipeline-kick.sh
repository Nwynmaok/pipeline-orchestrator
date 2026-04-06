#!/bin/bash
# Manually trigger an agent run via Claude Code CLI
# Usage: scripts/pipeline-kick.sh <agent> [--project <project-name>]

set -euo pipefail

AGENT="${1:-}"
PROJECT=""

if [[ -z "$AGENT" ]]; then
  echo "Usage: pipeline-kick.sh <agent> [--project <project-name>]" >&2
  echo "Agents: coordinator, pm, architect, backend, frontend, reviewer, qa, devops" >&2
  exit 1
fi

# Parse optional --project flag
shift
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project)
      PROJECT="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

VALID_AGENTS="coordinator pm architect backend frontend reviewer qa devops"
if [[ ! " $VALID_AGENTS " =~ " $AGENT " ]]; then
  echo "ERROR: Unknown agent: $AGENT" >&2
  echo "Valid agents: $VALID_AGENTS" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
PROMPT_FILE="$REPO_DIR/prompts/$AGENT.md"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: Prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

PROMPT=$(cat "$PROMPT_FILE")

# If a specific project was requested, append it to the prompt
if [[ -n "$PROJECT" ]]; then
  PROMPT="$PROMPT

---
FOCUS: Only work on the project '$PROJECT'. Skip all other projects."
fi

echo "Kicking $AGENT agent..."
if [[ -n "$PROJECT" ]]; then
  echo "  Project: $PROJECT"
fi

# Run via Claude Code CLI
claude --print "$PROMPT"
