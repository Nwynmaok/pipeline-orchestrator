# RULES.md - Learned Principles

_These are battle-tested rules learned from past mistakes and successes. Each rule was earned through experience. Follow them to avoid repeating history._

_Format: Each rule includes when it was learned, what went wrong (or right), and the principle to follow._

## How Rules Work

- When you make a mistake that gets caught by a downstream agent (reviewer, QA, or production), document the lesson here as a new rule.
- When you do something well that prevents a bug or saves time, document that too.
- Before starting any new work, read these rules. They are your accumulated wisdom.
- Each rule earns +15 XP when added to the stats tracker.

## Rules

### RULE-001: Update the frontend type barrel when adding shared types
**Learned:** 2026-03-28
**Context:** Backend agent added `HandoffEventLog` to `src/shared/types.ts` for Phase 2 but did not update `src/client/types/state.ts` (the barrel re-export). TypeScript caught it during pre-deploy typecheck — `StateContext.tsx` could not import `HandoffEventLog`. One-line fix unblocked the build, but it would have been a silent runtime failure if the typecheck step had been skipped.
**Principle:** After adding any new exported type to `src/shared/types.ts`, always verify `src/client/types/state.ts` includes it in its `export type { ... }` block. The barrel is the frontend's single import surface for shared types.
**Category:** TypeScript / shared types / pre-deploy checklist

<!-- 
Template for adding rules:

### RULE-{number}: {Short title}
**Learned:** {date}
**Context:** {What happened — the bug, the miss, or the success}
**Principle:** {The rule to follow going forward}
**Category:** {Which skill this relates to}
-->
