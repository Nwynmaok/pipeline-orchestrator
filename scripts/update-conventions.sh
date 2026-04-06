#!/bin/bash
# Run this when cutting over from OpenClaw to the pipeline orchestrator.
# Updates CONVENTIONS.md to reflect orchestrator-managed XP logging.

CONVENTIONS="/Users/wynclaw/.openclaw/shared/pipeline/CONVENTIONS.md"

if [ ! -f "$CONVENTIONS" ]; then
  echo "CONVENTIONS.md not found at $CONVENTIONS"
  exit 1
fi

echo "Updating CONVENTIONS.md..."

# Replace the XP Event Logging section
# The orchestrator handles XP logging automatically — agents don't need to echo to JSONL manually.
sed -i '' '/^## XP Event Logging/,/^---/{
  /^## XP Event Logging/c\
## XP Event Logging\
\
XP events are logged automatically by the pipeline orchestrator after each agent run.\
Agents do not need to manually append to agent-events.jsonl.\
\
The orchestrator tracks: feature_implemented, clean_pass_review, clean_pass_qa,\
bug_found_by_reviewer, bug_found_by_qa, rule_learned, blocker_detected_early,\
successful_deploy, bug_fixed.\
\
### XP Table
  /^---/!{
    /^### XP Table/!d
  }
}' "$CONVENTIONS"

echo "Done. CONVENTIONS.md updated."
echo "Review the changes: git diff $CONVENTIONS"
