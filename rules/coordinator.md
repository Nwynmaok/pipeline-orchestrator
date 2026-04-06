# RULES.md - Learned Principles

_These are battle-tested rules learned from past mistakes and successes. Each rule was earned through experience. Follow them to avoid repeating history._

_Format: Each rule includes when it was learned, what went wrong (or right), and the principle to follow._

## How Rules Work

- When you make a mistake that gets caught by a downstream agent (reviewer, QA, or production), document the lesson here as a new rule.
- When you do something well that prevents a bug or saves time, document that too.
- Before starting any new work, read these rules. They are your accumulated wisdom.
- Each rule earns +15 XP when added to the stats tracker.

## Rules

### RULE-002: When a pipeline convention changes, update CONVENTIONS.md — not individual agent workspaces
**Learned:** 2026-03-21
**Context:** Pipeline conventions (artifact naming, review verdicts, bug file rules, phase naming) were accumulated in the coordinator's TOOLS.md but never propagated to agent workspaces. Each time a convention evolved, 7 agent files needed updating — and they always drifted. Discovered today that done-{slug}.md, needs-clarification.md, PHASE.md, review verdicts, and bug conventions were all missing from agent workspaces.
**Principle:** The single source of truth for pipeline conventions is `/Users/wynclaw/.openclaw/shared/pipeline/CONVENTIONS.md`. When any convention changes, update CONVENTIONS.md only. All agents read it on startup. Never update individual agent TOOLS.md or AGENTS.md for pipeline convention changes.
**Category:** System maintenance

### RULE-001: Only escalate to Nathan when action is truly required
**Learned:** 2026-03-19
**Context:** The 12pm cron included two "Needs attention" items — (1) a stale ⚠️ PRD Issue flag in a review file that was already documented as stale in the TRACKER with explicit "no action needed" notes, and (2) a post-deploy reminder for Polymarket market rediscovery that isn't actionable until DevOps hands off the deploy plan. Nathan had to follow up to clarify neither needed his attention.
**Principle:** Before including anything in the "Needs attention" section of a cron sync message, ask: "Does Nathan need to do something *right now* to unblock the pipeline?" If the answer is no — it's already documented, it's informational, or it's future-facing — do not surface it. Items already captured in TRACKER.md with documented handling do not need re-escalation. Save Nathan's attention for real blockers and decisions.
**Category:** Escalation hygiene

<!-- 
Template for adding rules:

### RULE-{number}: {Short title}
**Learned:** {date}
**Context:** {What happened — the bug, the miss, or the success}
**Principle:** {The rule to follow going forward}
**Category:** {Which skill this relates to}
-->
