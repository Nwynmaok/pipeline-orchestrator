# PRD: Pipeline Orchestrator
**Project:** pipeline-orchestrator
**Author:** Nathan + Claude (ported from 11-project OpenClaw pipeline)
**Date:** 2026-04-05
**Updated:** 2026-04-06
**Status:** Draft

---

## Problem Statement

Nathan runs an automated multi-agent development pipeline that has shipped 11 projects across multiple phases. The pipeline currently runs on OpenClaw, which has lost Claude API access via OAuth. The entire system — 8 specialized agents, cron-driven automation, review cycles, multi-phase project management, and a gamified skill-tracking layer — needs to be ported to a new execution model.

Rather than building a self-hosted Node.js daemon that calls the Claude API directly (incurring per-token API costs), the pipeline will use **Claude Code scheduled tasks** as the execution engine. Each agent becomes a Claude Code scheduled task that runs on a cron schedule, reads pipeline state from the filesystem, and writes artifacts directly — leveraging Claude Code's native file I/O instead of custom response parsing. This eliminates API billing entirely (usage is covered by the Claude plan) and removes the need for a persistent daemon process.

This is not a redesign of the pipeline's conventions. The pipeline's state machines, artifact naming, review cycles, and accumulated rules have been battle-tested over 3 weeks and 11 projects. The goal is a faithful port with a simpler, cheaper execution model.

---

## Goals & Success Metrics

- **Goal 1: Feature parity with OpenClaw pipeline** → All 11 existing project directories continue to work. A new project kicked off on the new orchestrator produces the same artifact flow as OpenClaw did.
- **Goal 2: Zero API cost** → By using Claude Code scheduled tasks instead of direct Claude API calls, agent runs are covered by the existing Claude plan. No per-token API billing. No `ANTHROPIC_API_KEY` required for agent execution.
- **Goal 3: Zero-infrastructure** → No persistent daemon, no PM2, no Node.js service to maintain. Claude Code scheduled tasks handle scheduling and execution. Lightweight helper scripts handle validation, XP tracking, and Telegram delivery.
- **Goal 4: Preserve accumulated intelligence** → All RULES.md content, CONVENTIONS.md, XP history, and learned behaviors carry over. Agent prompts (defined in scheduled task configurations) include their rules.
- **Goal 5: Operational continuity** → Agents run on the same schedule (coordinator on even hours, work agents on odd hours). Coordinator sync messages still deliver to Telegram.

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
- [ ] Each agent is a **Claude Code scheduled task** running on its own cron schedule
- [ ] No persistent daemon process — Claude Code handles scheduling and execution
- [ ] Claude Code reads/writes files directly using its native tools (no `<<<WRITE_FILE>>>` parsing, no custom response handling)
- [ ] Reads/writes to the existing shared pipeline directory at `/Users/wynclaw/.openclaw/shared/pipeline/` (or a configurable path)
- [ ] A shared `CLAUDE.md` in the pipeline directory injects CONVENTIONS.md content and shared pipeline rules into every agent session
- [ ] Per-agent `CLAUDE.md` files (or rules files referenced in the task prompt) inject agent-specific RULES.md content
- [ ] Claude Code manages its own conversation context per session — no custom conversation store needed

### Scheduling
- [ ] Each agent has its own **Claude Code scheduled task** with a cron expression
- [ ] Coordinator: `0 0,12,14,16,18,20,22 * * *` PT (even hours, 12 PM – 12 AM)
- [ ] Work agents (pm, architect, backend, frontend, reviewer, qa): `0 13,15,17,19,21,23 * * *` PT (odd hours)
- [ ] Schedule window: 12 PM – 12 AM Pacific daily
- [ ] Each agent's task prompt includes its trigger conditions — Claude Code evaluates them by reading pipeline state and skips if no work is needed (replaces Haiku pre-check)
- [ ] Optional: event-driven dispatch via Claude Code hooks or file-watching scripts that trigger `claude` CLI runs on artifact changes

### Agent System
- [ ] 8 agents defined as Claude Code scheduled tasks: coordinator, pm, architect, frontend, backend, reviewer, qa, devops
- [ ] Each agent's scheduled task prompt includes: persona, operating instructions, trigger conditions, output format requirements, and references to CONVENTIONS.md and RULES.md (read from disk at runtime via CLAUDE.md)
- [ ] Claude Code model selection is configured per scheduled task (Sonnet for most agents, Opus for architect and reviewer)
- [ ] Pre-check logic is embedded in the agent prompt itself — "First, check if you have work to do. If not, report that and exit." — no separate Haiku call needed

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
- [ ] Validation is performed by the agent itself as part of its task prompt ("After writing, verify your output meets these structural requirements") and/or by lightweight helper scripts that Claude Code runs post-write
- [ ] Failed validation writes a `context-{slug}.md` with specific feedback and routes back to the owning agent

### Event-Driven Handoffs (new — not in OpenClaw)
- [ ] Optional: a lightweight file-watcher script (or Claude Code hook) monitors the shared pipeline directory for new/modified artifacts
- [ ] When an agent writes an artifact, the watcher can trigger the next agent's Claude Code session immediately via `claude` CLI (instead of waiting for the next scheduled window)
- [ ] Configurable: scheduled-only mode (cron via Claude Code scheduled tasks) or hybrid mode (scheduled + event-driven triggers)

### Context Summaries (new — not in OpenClaw)
- [ ] Each agent's task prompt instructs it to write a `handoff-{slug}.md` summarizing what was produced and key decisions made
- [ ] Downstream agents' task prompts instruct them to read `handoff-{slug}.md` for context on upstream work
- [ ] Summaries stored in `handoff-{slug}.md` in the project directory for traceability

### Pipeline Quest (Skill Tracking)
- [ ] XP events logged to `agent-events.jsonl` using the established XP table
- [ ] Agent stats tracked in `agent-stats.json` with levels, skills, and D&D-style attributes
- [ ] RULES.md content earns +15 XP per rule
- [ ] Clean pass through review: +25 XP; clean pass through QA: +30 XP
- [ ] Bug found by reviewer: -10 XP to author; bug found by QA: -15 XP to author
- [ ] Successful deploy: +35 XP
- [ ] Stats viewable via the Pipeline Quest visualizer (existing React component or web dashboard)

### Telegram Integration
- [ ] Coordinator task prompt instructs Claude Code to run a lightweight Telegram delivery script (e.g., `scripts/telegram-send.sh`) after composing the sync message
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
- **Claude Code scheduled tasks** as the execution engine for all 8 pipeline agents
- Agent task prompts with full trigger logic, operating instructions, and output format requirements ported from OpenClaw
- Scheduled task cron configuration (coordinator on even hours, agents on odd hours)
- Optional event-driven handoff via file-watcher script + `claude` CLI
- Validation logic (embedded in agent prompts and/or lightweight helper scripts)
- Context summaries via handoff files (written by agents as part of their task)
- Multi-phase project support
- Review cycle and bug fix cycle state machines (encoded in agent prompts)
- Post-QA artifact freeze with patch files
- Staleness detection (coordinator prompt logic)
- Pipeline Quest XP tracking (helper script called by agents)
- Telegram sync delivery (helper script called by coordinator)
- Lightweight CLI scripts for status, start, kick, stats, logs
- Helper scripts for validation, XP logging, Telegram delivery
- A shared `CLAUDE.md` encoding pipeline conventions and rules
- Existing shared pipeline directory compatibility (all 11 project directories work as-is)

### Out of Scope
- Self-hosted Node.js daemon or persistent service (replaced by Claude Code scheduled tasks)
- Direct Claude API calls or `@anthropic-ai/sdk` usage (Claude Code handles model invocation)
- PM2 or launchd daemon management (no daemon to manage)
- Custom response parsing (`<<<WRITE_FILE>>>` markers — Claude Code writes files natively)
- Custom conversation history management (Claude Code manages its own context)
- Web UI dashboard (use existing Pipeline Quest React visualizer or Telegram)
- Non-pipeline cron jobs (NBA pipeline, MLB pipeline, Pokémon tracker, morning briefing — these are separate systems)
- Mobile app
- Multi-user support
- Authentication/authorization (runs locally on Nathan's machine)

---

## Technical Constraints

- **Execution engine:** Claude Code scheduled tasks (cloud or desktop) — no self-hosted daemon
- **Agent invocation:** Claude Code handles model selection and invocation. Sonnet for most agents, Opus for architect and reviewer — configured per scheduled task.
- **No API key required:** Agent runs are covered by the Claude plan. No `ANTHROPIC_API_KEY` needed for agent execution.
- **Helper scripts:** Bash/Node.js scripts for validation, XP tracking, Telegram delivery, and CLI commands. These are lightweight utilities that Claude Code calls during agent runs.
- **Storage:** Filesystem only — markdown files and JSONL logs (no database required)
- **Deployment:** Claude Code scheduled tasks run on Anthropic infrastructure (cloud) or locally (desktop app). No PM2 or launchd needed.
- **Telegram:** Telegram Bot API direct via helper script (bot token: existing, chat ID: existing)
- **Existing data:** Must be backward-compatible with `/Users/wynclaw/.openclaw/shared/pipeline/` directory structure and all 11 project directories

---

## Open Questions

1. **Directory path:** Keep using `/Users/wynclaw/.openclaw/shared/pipeline/` for backward compatibility, or migrate to a new path like `~/pipeline/`? The old path works but ties the directory naming to a defunct tool.
2. **Cloud vs Desktop scheduled tasks:** Cloud tasks run on Anthropic infrastructure (machine doesn't need to be on, but gets a fresh clone — no local filesystem access). Desktop tasks run locally (full filesystem access, but machine must be running). The pipeline needs filesystem access to the shared pipeline directory — **desktop scheduled tasks or a synced repo** may be required.
3. **Event-driven triggers:** Should event-driven handoffs be implemented? If so, a lightweight file-watcher daemon or Claude Code hook could trigger `claude` CLI runs on artifact changes. This adds some infrastructure but speeds up the pipeline.
4. **Validation approach:** Should validation be purely prompt-based (agent self-validates), script-based (helper scripts check structure), or hybrid? Prompt-based is simplest but less deterministic. Script-based is reliable but requires maintenance.

---

## Dependencies

- **Claude Code** (CLI, Desktop app, or Web) with scheduled tasks capability
- **Claude plan** with sufficient usage for scheduled task runs
- Telegram Bot API (existing bot token and chat ID)
- Existing shared pipeline directory with all project artifacts
- `curl` or similar for Telegram delivery script (no additional runtime dependencies)

---

## Reference Materials

- `pipeline-export-2026-04-05.md` — complete system export including CONVENTIONS.md, all cron prompts, coordinator memory, XP event log, tracker/dashboard examples, RULES.md files, file tree, and cron configurations
- Existing `agent-stats.json` — current Pipeline Quest state
- Existing `agent-events.jsonl` — 150+ XP events from 11 projects
