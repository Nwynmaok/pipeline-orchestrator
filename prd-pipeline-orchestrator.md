# PRD: Pipeline Orchestrator
**Project:** pipeline-orchestrator
**Author:** Nathan + Claude (ported from 11-project OpenClaw pipeline)
**Date:** 2026-04-05
**Status:** Draft

---

## Problem Statement

Nathan runs an automated multi-agent development pipeline that has shipped 11 projects across multiple phases. The pipeline currently runs on OpenClaw, which has lost Claude API access via OAuth. The entire system — 8 specialized agents, cron-driven automation, review cycles, multi-phase project management, and a gamified skill-tracking layer — needs to be ported to a self-hosted Node.js service that calls the Claude API directly.

This is not a redesign. The pipeline's conventions, state machines, and accumulated rules have been battle-tested over 3 weeks and 11 projects. The goal is a faithful port with targeted improvements.

---

## Goals & Success Metrics

- **Goal 1: Feature parity with OpenClaw pipeline** → All 11 existing project directories continue to work. A new project kicked off on the new orchestrator produces the same artifact flow as OpenClaw did.
- **Goal 2: Zero-dependency on OpenClaw** → The orchestrator runs standalone on Nathan's Mac Mini using only Node.js, the Claude API, and the filesystem. No OpenClaw, no third-party orchestration framework.
- **Goal 3: Reduced token waste** → Event-driven handoffs replace blind polling. Validation gates catch bad artifacts before they advance. Target: 50%+ reduction in wasted API calls vs OpenClaw cron polling.
- **Goal 4: Preserve accumulated intelligence** → All RULES.md content, CONVENTIONS.md, XP history, and learned behaviors carry over. Agent system prompts include their rules.
- **Goal 5: Operational continuity** → The orchestrator runs as a daemon (PM2 or launchd), survives reboots, and delivers sync messages to Telegram on the same schedule.

---

## User Stories

- As Nathan, I want to kick off a new project by creating a TRACKER.md with intake notes so the pipeline automatically generates a PRD, TDD, implementation, review, QA, and deploy plan without me manually routing between agents.
- As Nathan, I want to check the pipeline status on my phone (via Telegram sync messages) so I know what's progressing, what's blocked, and what needs my input.
- As Nathan, I want the system to catch bad artifacts (PRDs without acceptance criteria, TDDs that don't reference the PRD) before they advance to the next stage so downstream agents don't waste tokens on garbage input.
- As Nathan, I want the review cycle (Changes Requested → Engineer Response Submitted → re-review) to work automatically without me intervening, just like it did in OpenClaw.
- As Nathan, I want multi-phase projects to work with the same PHASE.md convention and `-phaseN` artifact suffixes so existing projects can continue seamlessly.
- As Nathan, I want agents to accumulate rules in RULES.md that get injected into their system prompts so they improve over time and don't repeat past mistakes.
- As Nathan, I want XP events logged and skill levels tracked so I can see which agents are performing well and which need attention.
- As Nathan, I want the deploy stage to remain manual — the coordinator flags me, I decide when to deploy.

---

## Acceptance Criteria

### Core Orchestrator
- [ ] Node.js service runs as a persistent daemon on the Mac Mini (PM2 or launchd)
- [ ] Calls Claude API directly (no OpenClaw, no third-party wrapper) with per-agent model selection (Sonnet default, Opus for architect + reviewer)
- [ ] Uses Haiku for validation gates and pre-checks to minimize cost
- [ ] Reads/writes to the existing shared pipeline directory at `/Users/wynclaw/.openclaw/shared/pipeline/` (or a configurable path)
- [ ] CONVENTIONS.md is injected into every agent's system prompt
- [ ] Agent RULES.md content is injected into the owning agent's system prompt
- [ ] Conversation history is persisted per-agent so context carries across sessions

### Scheduling
- [ ] Cron-based scheduling matching the current pattern: coordinator on even hours (0, 12, 14, 16, 18, 20, 22 PT), agents on odd hours (13, 15, 17, 19, 21, 23 PT)
- [ ] Schedule window: 12 PM – 12 AM Pacific daily
- [ ] Each agent run uses the exact cron prompt logic from the OpenClaw export (pre-checks, multi-condition triggers, phase awareness)
- [ ] Optional: event-driven mode where file changes trigger the next agent immediately instead of waiting for the next cron window

### Agent System
- [ ] 8 agents defined: coordinator, pm, architect, frontend, backend, reviewer, qa, devops
- [ ] Each agent has a system prompt composed of: base persona (SOUL.md equivalent) + operating instructions (AGENTS.md equivalent) + CONVENTIONS.md + RULES.md + project context
- [ ] Agent model assignment: Sonnet 4-6 for coordinator, pm, frontend, backend, qa, devops; Opus 4-6 for architect and reviewer
- [ ] Haiku 4-5 for validation gates and pre-check "is there work?" scans

### Pipeline Stages (must match OpenClaw behavior exactly)
- [ ] 7-stage flow: Requirements → Design → Implementation → Review → QA → Deploy → Complete
- [ ] Coordinator is sole writer of TRACKER.md and DASHBOARD.md
- [ ] Artifact ownership enforced: each agent only writes its own artifact types
- [ ] Review cycle state machine: `Approved` | `Approved with Comments` | `Changes Requested` | `Engineer Response Submitted`
- [ ] ⚠️ TDD Issue / ⚠️ PRD Issue flags block engineer action; coordinator escalates to Nathan
- [ ] Bug fix cycle: QA files bugs → engineer marks Fixed → reviewer deletes bugs+testplan, writes fresh review → QA re-triggers
- [ ] Coordinator-identified bug cycle: coordinator writes `[Coordinator]`-tagged bugs → same flow
- [ ] Post-QA artifact freeze: impl files frozen after QA passes; changes go in `patch-{slug}.md`
- [ ] Staleness detection: coordinator compares TDD timestamps vs impl timestamps on every sync
- [ ] Completion signal: DevOps writes `done-{slug}.md` → coordinator marks project Complete

### Multi-Phase Support
- [ ] Every project has a PHASE.md with `Current Phase: N`
- [ ] Phase 1 artifacts use flat naming; Phase 2+ use `-phaseN` suffix
- [ ] Cron agents read PHASE.md first on every run
- [ ] Coordinator is the sole incrementer of PHASE.md
- [ ] Incrementing PHASE.md to N+1 triggers the next phase pipeline automatically

### Special File Conventions
- [ ] `needs-revision-prd-{slug}.md` — Nathan-authored only; PM picks up and revises PRD
- [ ] `needs-revision-tdd-{slug}.md` — Nathan-authored only; Architect picks up and revises TDD
- [ ] `needs-clarification.md` — any agent writes when blocked; coordinator escalates to Nathan
- [ ] `context-{slug}.md` — coordinator-authored correction notes for a specific agent
- [ ] `patch-{slug}.md` — post-QA changes (frozen impl files)

### Validation Gates (new — not in OpenClaw)
- [ ] PRD validation: has Problem Statement, Goals, User Stories, Acceptance Criteria, Scope sections
- [ ] TDD validation: references the PRD filename, has Architecture, Data Model, API Contract, Task Breakdown sections
- [ ] Review validation: contains exactly one of the four verdict strings
- [ ] QA validation: testplan traces back to PRD acceptance criteria
- [ ] Validation runs on Haiku before advancing to the next stage
- [ ] Failed validation writes a `context-{slug}.md` with specific feedback and routes back to the owning agent

### Event-Driven Handoffs (new — not in OpenClaw)
- [ ] `fs.watch` monitors the shared pipeline directory for new/modified files
- [ ] When an agent writes an artifact, the orchestrator detects the change and can optionally dispatch the next agent immediately (instead of waiting for the next cron window)
- [ ] Configurable: `mode: "cron"` (OpenClaw-compatible polling) or `mode: "event"` (immediate dispatch) or `mode: "hybrid"` (events during active hours, cron as fallback)

### Context Summaries (new — not in OpenClaw)
- [ ] When an agent completes work, the orchestrator generates a 2-3 sentence summary of what was produced and key decisions made
- [ ] This summary is prepended to the downstream agent's prompt so it has the "why" alongside the "what"
- [ ] Summaries stored in a `handoff-{slug}.md` or equivalent for traceability

### Pipeline Quest (Skill Tracking)
- [ ] XP events logged to `agent-events.jsonl` using the established XP table
- [ ] Agent stats tracked in `agent-stats.json` with levels, skills, and D&D-style attributes
- [ ] RULES.md content earns +15 XP per rule
- [ ] Clean pass through review: +25 XP; clean pass through QA: +30 XP
- [ ] Bug found by reviewer: -10 XP to author; bug found by QA: -15 XP to author
- [ ] Successful deploy: +35 XP
- [ ] Stats viewable via the Pipeline Quest visualizer (existing React component or web dashboard)

### Telegram Integration
- [ ] Coordinator sync messages delivered to Telegram using the Telegram Bot API directly (not OpenClaw's channel system)
- [ ] Same format as current: `🔄 Pipeline Sync — {time} PT` with project status blocks and `⚠️ Needs Your Input` section
- [ ] Escalation hygiene: only surface items where Nathan needs to act right now to unblock the pipeline (RULE-001)

### CLI Interface
- [ ] `pipeline status` — show DASHBOARD.md contents
- [ ] `pipeline start {project-name}` — create project directory with TRACKER.md and PHASE.md, trigger PM
- [ ] `pipeline kick {agent}` — manually trigger a specific agent's run outside the schedule
- [ ] `pipeline stats` — show Pipeline Quest agent levels and XP
- [ ] `pipeline logs {agent}` — show recent run history for an agent
- [ ] `pipeline cron list` — show scheduled jobs and their status

---

## Scope

### In Scope
- Node.js orchestrator with Claude API integration
- All 8 pipeline agents with full cron prompt logic ported from OpenClaw
- Cron scheduling (node-cron or similar)
- Event-driven handoff option (fs.watch)
- Validation gates between stages
- Context summaries in handoffs
- Multi-phase project support
- Review cycle and bug fix cycle state machines
- Post-QA artifact freeze with patch files
- Staleness detection
- Pipeline Quest XP tracking
- Telegram sync delivery (Telegram Bot API)
- CLI for status, start, kick, stats, logs
- PM2 or launchd daemon management
- Existing shared pipeline directory compatibility (all 11 project directories work as-is)

### Out of Scope
- Web UI dashboard (use existing Pipeline Quest React visualizer or Telegram)
- Non-pipeline cron jobs (NBA pipeline, MLB pipeline, Pokémon tracker, morning briefing — these are separate systems)
- Claude Code Agent Teams integration (future enhancement for parallel implementation)
- Mobile app
- Multi-user support
- Authentication/authorization (runs locally on Nathan's Mac Mini behind Tailscale)

---

## Technical Constraints

- **Runtime:** Node.js (matches Nathan's existing stack and Mac Mini setup)
- **Language:** TypeScript preferred
- **API:** Claude API via `@anthropic-ai/sdk` — models: `claude-sonnet-4-6` (default), `claude-opus-4-6` (architect, reviewer), `claude-haiku-4-5` (validation gates)
- **Storage:** Filesystem only — markdown files and JSONL logs (no database required)
- **Deployment:** Mac Mini, managed by PM2 or launchd, behind Tailscale
- **Telegram:** Telegram Bot API direct (bot token: existing, chat ID: existing)
- **Existing data:** Must be backward-compatible with `/Users/wynclaw/.openclaw/shared/pipeline/` directory structure and all 11 project directories

---

## Open Questions

1. **Directory path:** Keep using `/Users/wynclaw/.openclaw/shared/pipeline/` for backward compatibility, or migrate to a new path like `~/pipeline/`? The old path works but ties the directory naming to a defunct tool.
2. **Conversation history depth:** How many turns of conversation history to persist per agent? Full history burns tokens; too little loses context. Suggest: last 5 turns + system prompt, with full history available on demand.
3. **Event-driven vs cron default:** Should the default mode be event-driven (immediate dispatch on file change) or cron (matching OpenClaw behavior)? Recommend: hybrid — events during active hours, cron as safety net.
4. **Cost budget:** What's the acceptable daily API spend? Current OpenClaw usage hit Anthropic limits frequently. Validation gates on Haiku + event-driven handoffs should reduce waste, but need a target.

---

## Dependencies

- Anthropic API key with sufficient usage limits
- Node.js 20+ on Mac Mini
- PM2 (`npm install -g pm2`) for daemon management
- Telegram Bot API (existing bot token and chat ID)
- Existing shared pipeline directory with all project artifacts

---

## Reference Materials

- `pipeline-export-2026-04-05.md` — complete system export including CONVENTIONS.md, all cron prompts, coordinator memory, XP event log, tracker/dashboard examples, RULES.md files, file tree, and cron configurations
- Existing `agent-stats.json` — current Pipeline Quest state
- Existing `agent-events.jsonl` — 150+ XP events from 11 projects
