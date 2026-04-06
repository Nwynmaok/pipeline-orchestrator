#!/bin/bash
# Validate artifact structure
# Usage: scripts/validate-artifact.sh <type> <file>
# Types: prd, tdd, review, qa
# Returns: exit 0 if valid, exit 1 if invalid (errors on stderr)

set -euo pipefail

TYPE="${1:-}"
FILE="${2:-}"

if [[ -z "$TYPE" || -z "$FILE" ]]; then
  echo "Usage: validate-artifact.sh <type> <file>" >&2
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "ERROR: File not found: $FILE" >&2
  exit 1
fi

ERRORS=()

case "$TYPE" in
  prd)
    # PRD must have: Problem Statement, Goals, User Stories, Acceptance Criteria, Scope
    for section in "Problem Statement" "Goals" "User Stories" "Acceptance Criteria" "Scope"; do
      if ! grep -qi "## .*${section}" "$FILE"; then
        ERRORS+=("Missing required section: ${section}")
      fi
    done
    ;;

  tdd)
    # TDD must reference PRD filename and have: Architecture, Data Model, API Contract, Task Breakdown
    if ! grep -qi "prd-" "$FILE"; then
      ERRORS+=("TDD does not reference a PRD filename (prd-*.md)")
    fi
    for section in "Architecture" "Data Model" "API Contract" "Task Breakdown"; do
      if ! grep -qi "## .*${section}" "$FILE"; then
        ERRORS+=("Missing required section: ${section}")
      fi
    done
    ;;

  review)
    # Review must contain exactly one verdict
    VERDICT_COUNT=0
    for verdict in "Approved with Comments" "Approved" "Changes Requested" "Engineer Response Submitted"; do
      if grep -q "$verdict" "$FILE"; then
        VERDICT_COUNT=$((VERDICT_COUNT + 1))
      fi
    done
    # "Approved with Comments" also matches "Approved", so adjust
    # Count more precisely: look for exact verdict lines
    VERDICT_COUNT=0
    if grep -q "Engineer Response Submitted" "$FILE"; then
      VERDICT_COUNT=$((VERDICT_COUNT + 1))
    fi
    if grep -q "Changes Requested" "$FILE"; then
      VERDICT_COUNT=$((VERDICT_COUNT + 1))
    fi
    if grep -q "Approved with Comments" "$FILE"; then
      VERDICT_COUNT=$((VERDICT_COUNT + 1))
    elif grep -q "Approved" "$FILE"; then
      VERDICT_COUNT=$((VERDICT_COUNT + 1))
    fi
    if [[ $VERDICT_COUNT -eq 0 ]]; then
      ERRORS+=("Review contains no verdict (expected one of: Approved, Approved with Comments, Changes Requested, Engineer Response Submitted)")
    elif [[ $VERDICT_COUNT -gt 1 ]]; then
      ERRORS+=("Review contains multiple verdicts (expected exactly one)")
    fi
    ;;

  qa)
    # Test plan should reference acceptance criteria
    if ! grep -qi "acceptance criteria\|AC-\|acceptance" "$FILE"; then
      ERRORS+=("Test plan does not appear to trace back to PRD acceptance criteria")
    fi
    ;;

  *)
    echo "ERROR: Unknown artifact type: $TYPE (expected: prd, tdd, review, qa)" >&2
    exit 1
    ;;
esac

if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "VALIDATION FAILED for $FILE:" >&2
  for err in "${ERRORS[@]}"; do
    echo "  - $err" >&2
  done
  exit 1
fi

echo "VALIDATION PASSED: $FILE"
exit 0
