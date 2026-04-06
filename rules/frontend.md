# RULES.md - Learned Principles

_These are battle-tested rules learned from past mistakes and successes. Each rule was earned through experience. Follow them to avoid repeating history._

_Format: Each rule includes when it was learned, what went wrong (or right), and the principle to follow._

## How Rules Work

- When you make a mistake that gets caught by a downstream agent (reviewer, QA, or production), document the lesson here as a new rule.
- When you do something well that prevents a bug or saves time, document that too.
- Before starting any new work, read these rules. They are your accumulated wisdom.
- Each rule earns +15 XP when added to the stats tracker.

## Rules

### RULE-001: Guard conditions must reflect what actually renders, not what exists in the array
**Learned:** 2026-03-19
**Context:** `hasPicks` in `index.ejs` checked `picks.picks.length > 0` (raw array), but picks were grouped by strict confidence equality. Picks with unrecognized confidence values (e.g. `"very_high"`) fell through all three groups and were silently dropped — yet `hasPicks` was still true, so the empty state never showed. The user saw a blank picks area with no explanation.
**Principle:** When a list is split into groups by strict equality filters, the "has content" guard must check the sum of rendered groups, not the source array length. Always add a catch-all group for enum-like fields so no items are silently lost.
**Category:** EJS templates, data rendering, guard conditions

<!-- 
Template for adding rules:

### RULE-{number}: {Short title}
**Learned:** {date}
**Context:** {What happened — the bug, the miss, or the success}
**Principle:** {The rule to follow going forward}
**Category:** {Which skill this relates to}
-->
