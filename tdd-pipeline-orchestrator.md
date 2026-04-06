# TDD: Pipeline Orchestrator
**Project:** pipeline-orchestrator
**Author:** Claude (Architect)
**Date:** 2026-04-05
**Updated:** 2026-04-06
**Status:** Draft
**References:** prd-pipeline-orchestrator.md, pipeline-export-2026-04-05.md

---

## 1. Architecture Overview

The pipeline orchestrator uses **Claude Code scheduled tasks** as its execution engine instead of a self-hosted Node.js daemon. Each pipeline agent is a Claude Code scheduled task that runs on a cron schedule, reads pipeline state from the filesystem, and writes artifacts directly using Claude Code's native file I/O.

### What Claude Code Replaces

| Previous (Daemon) | New (Claude Code) |
|---|---|
| `agent-runner.ts` — Claude API calls | Claude Code session runs the agent directly |
| `prompt-composer.ts` — system prompt assembly | Task prompt + `CLAUDE.md` files |
| `conversation-store.ts` — JSONL history | Claude Code manages its own context |
| `<<<WRITE_FILE>>>` response parsing | Claude Code writes files natively |
| `node-cron` scheduler | Claude Code scheduled task cron |
| `chokidar` file watcher | Optional: lightweight watcher script triggers `claude` CLI |
| PM2 daemon | No daemon — Claude Code handles lifecycle |
| `@anthropic-ai/sdk` | No SDK — Claude Code handles model invocation |

### What Remains as Code

| Component | Purpose | Form |
|---|---|---|
| Validation scripts | Structural checks on artifacts | Bash/Node scripts in `scripts/` |
| XP tracking | Append to `agent-events.jsonl`, update `agent-stats.json` | Bash/Node script in `scripts/` |
| Telegram delivery | POST to Telegram Bot API | Bash script in `scripts/` |
| CLI utilities | `pipeline status`, `pipeline start`, `pipeline stats`, etc. | Bash/Node scripts in `scripts/` |
| Pipeline state helpers | Read PHASE.md, resolve artifact names, detect staleness | Bash/Node scripts in `scripts/` |

## 2. Project Structure

```
pipeline-orchestrator/
├── CLAUDE.md                         # Shared pipeline conventions, injected into all agent sessions
├── rules/                            # Per-agent RULES.md files
│   ├── coordinator.md
│   ├── pm.md
│   ├── architect.md
│   ├── backend.md
│   ├── frontend.md
│   ├── reviewer.md
│   ├── qa.md
│   └── devops.md
│
├── prompts/                          # Agent task prompts (used in scheduled task config)
│   ├── coordinator.md
│   ├── pm.md
│   ├── architect.md
│   ├── backend.md
│   ├── frontend.md
│   ├── reviewer.md
│   ├── qa.md
│   └── devops.md
│
├── scripts/
│   ├── validate-artifact.sh          # Structural validation for PRD, TDD, review, QA artifacts
│   ├── xp-log.sh                     # Append XP event to agent-events.jsonl
│   ├── xp-stats.sh                   # Rebuild agent-stats.json from events
│   ├── telegram-send.sh              # Send message via Telegram Bot API
│   ├── pipeline-status.sh            # Display DASHBOARD.md contents
│   ├── pipeline-start.sh             # Create project dir with TRACKER.md + PHASE.md
│   ├── pipeline-kick.sh              # Trigger a Claude Code agent run via `claude` CLI
│   ├── pipeline-stats.sh             # Display Pipeline Quest agent levels
│   └── pipeline-logs.sh              # Show recent run history
│
├── data/
│   └── run-log.jsonl                 # Run log (agents append after each execution)
│
├── config.yaml                       # Pipeline configuration (directory paths, Telegram config, etc.)
├── prd-pipeline-orchestrator.md
├── tdd-pipeline-orchestrator.md
└── pipeline-export-2026-04-05.md
```

### Entry Points

| Entry Point | Purpose | How It Runs |
|---|---|---|
| Claude Code scheduled tasks | Agent execution on cron | Configured via `claude.ai/code/scheduled` or `/schedule` CLI |
| `scripts/pipeline-kick.sh <agent>` | Manual agent trigger | Runs `claude` CLI with the agent's prompt |
| `scripts/pipeline-status.sh` | Show dashboard | Reads and displays `DASHBOARD.md` |
| `scripts/pipeline-start.sh <project>` | Create new project | Creates dir, TRACKER.md, PHASE.md, triggers PM |

### Dependencies

| Dependency | Purpose |
|---|---|
| Claude Code (CLI or Desktop) | Scheduled task execution, agent sessions |
| `curl` | Telegram Bot API calls |
| `jq` (optional) | JSON processing in helper scripts |
| `bash` | Script execution |

---

## 3. Core Components

### 3.1 Agent Task Prompts (`prompts/{agent}.md`)

Each agent has a task prompt file that defines its complete behavior when run as a Claude Code scheduled task. The prompt includes:

```markdown
# {Agent Name} — Pipeline Agent

## Persona
You are the {role} agent in a multi-agent development pipeline.
{Static persona description — tone, expertise, responsibilities}

## Pre-Check
Before doing any work, scan the pipeline directory to determine if you have work.
Your trigger conditions are:
{Trigger conditions specific to this agent}

If none of your trigger conditions are met, report "No work found" and exit.

## Operating Instructions
{The full cron prompt logic from the export:
 - What files to read
 - What to produce
 - Output format requirements
 - File naming rules
 - Artifact ownership (what you can/cannot write)}

## Post-Work
After writing artifacts:
1. Run `scripts/validate-artifact.sh {artifact-type} {filepath}` to validate your output
2. If validation fails, fix the issues and re-validate
3. Run `scripts/xp-log.sh {agent} {event-type} {project} "{note}"` to log XP
4. Write a `handoff-{slug}.md` summarizing what you produced and key decisions

## Rules
Read and follow all rules in `rules/{agent}.md`
```

The prompt is used as the task description when configuring the Claude Code scheduled task.

### 3.2 Shared CLAUDE.md

A `CLAUDE.md` file at the project root that Claude Code automatically injects into every agent session. Contains:

```markdown
# Pipeline Conventions
{Contents of CONVENTIONS.md — artifact naming, review cycle rules, phase conventions, etc.}

# Pipeline Directory
All project artifacts live in: {configured pipeline directory path}

# Artifact Ownership
{Ownership matrix — which agents can write which file types}

# Helper Scripts
- `scripts/validate-artifact.sh <type> <file>` — validate artifact structure
- `scripts/xp-log.sh <agent> <event> <project> "<note>"` — log XP event
- `scripts/telegram-send.sh "<message>"` — send Telegram message
```

### 3.3 Trigger Conditions (embedded in agent prompts)

Each agent's prompt includes its trigger conditions. Claude Code evaluates these by reading the filesystem:

| Agent | Trigger Conditions |
|---|---|
| coordinator | Always runs on its schedule (even hours) |
| pm | (1) TRACKER.md Requirements Not Started/In Progress + no `prd-*` OR (2) `needs-revision-prd-*` exists |
| architect | (1) `prd-*` without `tdd-*` for current phase OR (2) `needs-revision-tdd-*` exists OR (3) Phase N>1 without `tdd-*-phaseN` |
| backend | (1) TDD exists indicating backend work, no `impl-backend-*` for current phase OR (2) `review-*` with Changes Requested (no flag, no ERS) OR (3) `bugs-*` with unfixed backend bugs |
| frontend | (1) TDD exists indicating frontend work, no `impl-frontend-*` for current phase OR (2) `review-*` with Changes Requested + frontend feedback (no flag, no ERS) OR (3) `bugs-*` with unfixed frontend bugs |
| reviewer | (1) `impl-*` without `review-*` for current phase OR (2) `review-*` with Engineer Response Submitted OR (3) `bugs-*` with all bugs Fixed (highest priority) |
| qa | (1) `review-*` with Approved/Approved with Comments, no `testplan-*` for current phase |
| devops | Never auto-dispatched — coordinator flags Nathan |

Since Claude Code can read the filesystem directly, it evaluates these conditions by listing directory contents and reading file contents — no separate dispatcher module needed.

### 3.4 Validation Scripts (`scripts/validate-artifact.sh`)

Lightweight bash scripts that perform structural validation on artifacts. Claude Code runs these after writing:

**Post-check (after agent writes artifact):** Validates the artifact meets structural requirements:

| Gate | Required Sections | Check |
|---|---|---|
| PRD | Problem Statement, Goals, User Stories, Acceptance Criteria, Scope | `grep` for section headers |
| TDD | References PRD filename, Architecture, Data Model, API Contract, Task Breakdown | `grep` for section headers + PRD reference |
| Review | Exactly one of: Approved, Approved with Comments, Changes Requested, Engineer Response Submitted | `grep -c` for verdict strings |
| QA | Testplan traces to PRD acceptance criteria | `grep` for AC references |

```bash
# Example: scripts/validate-artifact.sh prd /path/to/prd-myproject.md
# Returns exit code 0 if valid, 1 if invalid (with error messages on stderr)
```

**On failure:** The agent's prompt instructs it to fix the issues and re-validate. If validation fails after a retry, the agent writes a `context-{slug}.md` with specific feedback for the next run.

### 3.5 Handoff Files

Each agent's prompt instructs it to write a `handoff-{slug}.md` after completing work — a 2-3 sentence summary of what was produced and key decisions. Downstream agents' prompts instruct them to read this file for context.

No separate Haiku call is needed — the agent writes the handoff as part of its own run.

### 3.6 Review Cycle State Machine

The review cycle state machine is encoded in the agent prompts. Each agent reads the current review file to determine the review state. The logic is a pure function of filesystem state:

```
                    ┌──────────────────────────────────┐
                    │                                  │
                    ▼                                  │
[No Review] ──► [Changes Requested] ──► [Engineer Response Submitted] ──► [Re-Review]
                    │                                                         │
                    │ (has ⚠️ flag)                                           │
                    ▼                                                         │
              [Blocked — Nathan]                                              │
                                                                              │
[No Review] ──► [Approved / Approved with Comments] ──► [QA]                  │
                    ▲                                                         │
                    └─────────────────────────────────────────────────────────┘
```

**Bug fix cycle (post-QA):**
```
[QA finds bugs] ──► bugs-*.md written
       │
       ▼
[Engineer marks Fixed] ──► updates review verdict to ERS
       │
       ▼
[Reviewer re-reviews] ──► deletes bugs-* + testplan-* ──► writes fresh review
       │
       ▼
[Approved] ──► QA re-triggers
```

**Coordinator bug cycle:** Same flow, but bugs tagged `[Coordinator]` instead of `[QA]`.

The state machine is a pure function of filesystem state: `(currentFiles, fileContents) → ReviewState`. No mutable state — derived entirely from what's on disk. Each agent's prompt encodes the rules for its role in the cycle.

### 3.7 Phase Conventions

Phase logic is encoded in agent prompts. Each agent reads `PHASE.md` at the start of its run:

- Phase 1: flat naming (`tdd-{slug}.md`)
- Phase 2+: suffixed (`tdd-{slug}-phase2.md`)
- Only the coordinator can increment `PHASE.md` (enforced by prompt instructions + artifact ownership in CLAUDE.md)

### 3.8 Staleness Detection

The coordinator's prompt instructs it to compare modification times of TDD vs impl files using `stat` or `ls -la`. Stale impl files (where TDD is newer) are included in the sync message for Nathan.

### 3.9 Telegram Delivery (`scripts/telegram-send.sh`)

A simple bash script wrapping the Telegram Bot API:

```bash
#!/bin/bash
# scripts/telegram-send.sh "<message>"
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from config.yaml or environment

TOKEN="${TELEGRAM_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_CHAT_ID}"
MESSAGE="$1"

curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  -d text="${MESSAGE}" \
  -d parse_mode="Markdown"
```

The coordinator's prompt instructs it to compose the sync message and then run this script. Message format matches current pipeline sync:
```
🔄 Pipeline Sync — {time} PT

*{Project Name}*
{emoji} {Stage} — {status}

⚠️ *Needs Your Input*
• {project} — {what's needed}

⏭️ Next sync: {next even hour} PT
```

### 3.10 CLI Scripts

Standalone bash scripts that read pipeline state directly from the filesystem. No daemon or IPC needed — all state is on disk.

| Script | Action |
|---|---|
| `scripts/pipeline-status.sh` | Read and display `DASHBOARD.md` |
| `scripts/pipeline-start.sh {name}` | Create project dir with `TRACKER.md` + `PHASE.md`, trigger PM via `claude` CLI |
| `scripts/pipeline-kick.sh {agent}` | Run `claude` CLI with the agent's prompt for an immediate execution |
| `scripts/pipeline-stats.sh` | Display Pipeline Quest agent levels and XP from `agent-stats.json` |
| `scripts/pipeline-logs.sh {agent}` | Show recent run history from `data/run-log.jsonl` |

All commands work independently — no running daemon required.

---

## 4. Data Models

### 4.1 Agent Configuration

Each agent is configured as a Claude Code scheduled task. Key settings per task:

| Agent | Model | Cron (PT) | Can Write |
|---|---|---|---|
| coordinator | claude-sonnet-4-6 | `0 0,12,14,16,18,20,22 * * *` | TRACKER.md, DASHBOARD.md, PHASE.md, context-*.md, bugs-*.md (coordinator-tagged) |
| pm | claude-sonnet-4-6 | `0 13,15,17,19,21,23 * * *` | prd-*.md, stories-*.md |
| architect | claude-opus-4-6 | `0 13,15,17,19,21,23 * * *` | tdd-*.md, api-*.md |
| backend | claude-sonnet-4-6 | `0 13,15,17,19,21,23 * * *` | impl-backend-*.md, patch-*.md |
| frontend | claude-sonnet-4-6 | `0 13,15,17,19,21,23 * * *` | impl-frontend-*.md, patch-*.md |
| reviewer | claude-opus-4-6 | `0 13,15,17,19,21,23 * * *` | review-*.md |
| qa | claude-sonnet-4-6 | `0 13,15,17,19,21,23 * * *` | testplan-*.md, bugs-*.md |
| devops | claude-sonnet-4-6 | Manual only | deploy-*.md, done-*.md |

No separate Haiku calls for validation or pre-checks — validation is handled by scripts, and pre-check logic is embedded in each agent's prompt.

### 4.2 Pipeline State (filesystem, read each run)

Each agent reads pipeline state directly from the filesystem at the start of its run. The key artifacts it looks for per project:

**Artifacts:**
- `prd-{slug}.md` / `prd-{slug}-phaseN.md`
- `stories-{slug}.md`
- `tdd-{slug}.md` / `tdd-{slug}-phaseN.md`
- `api-{slug}.md`
- `impl-backend-{slug}.md` / `impl-backend-{slug}-phaseN.md`
- `impl-frontend-{slug}.md` / `impl-frontend-{slug}-phaseN.md`
- `review-{slug}.md` / `review-{slug}-phaseN.md`
- `testplan-{slug}.md` / `testplan-{slug}-phaseN.md`
- `bugs-{slug}.md`
- `deploy-{slug}.md`
- `done-{slug}.md`

**Special files:**
- `needs-revision-prd-{slug}.md` — Nathan-authored; PM picks up
- `needs-revision-tdd-{slug}.md` — Nathan-authored; Architect picks up
- `needs-clarification.md` — any agent writes when blocked
- `context-{slug}.md` — correction notes for a specific agent
- `patch-{slug}.md` — post-QA changes
- `handoff-{slug}.md` — upstream agent's context summary

**Review state (parsed from review file content):**
- Verdict: `Approved` | `Approved with Comments` | `Changes Requested` | `Engineer Response Submitted`
- Flags: `⚠️ TDD Issue` / `⚠️ PRD Issue` — blocks engineer action
- Engineer Response section presence
- Change request IDs (CR-001, CR-002, etc.)

**Bug state (parsed from bugs file content):**
- Bug entries with status: `Open` | `Fixed`
- Source: `[QA]` | `[Coordinator]`

### 4.3 Conversation History

Claude Code manages its own conversation context per session. No custom conversation store is needed. Each scheduled task run starts a fresh session with the full task prompt + CLAUDE.md context.

For cross-session continuity, agents rely on:
- The filesystem state (artifacts, TRACKER.md, PHASE.md) as the source of truth
- `handoff-{slug}.md` files for upstream context
- `context-{slug}.md` files for correction notes

### 4.4 Run Log (`data/run-log.jsonl`)

Each agent appends to the run log after execution via a helper script:

```json
{
  "ts": "2026-04-06T15:00:00Z",
  "agent": "backend",
  "project": "restock-monitor",
  "trigger": "scheduled",
  "condition": "TDD exists, no impl-backend for current phase",
  "artifactsWritten": ["impl-backend-restock-monitor.md"],
  "artifactsDeleted": [],
  "validationPassed": true,
  "note": "Initial backend implementation"
}
```

### 4.5 XP Events (`agent-events.jsonl` — existing format, preserved)

```json
{
  "ts": "2026-04-06T15:00:00Z",
  "agent": "backend",
  "event": "feature_implemented",
  "xp": 20,
  "project": "restock-monitor",
  "note": "Implemented backend for restock-monitor"
}
```

**XP values per event type:**

| Event | XP |
|---|---|
| `clean_pass_review` | +25 |
| `clean_pass_qa` | +30 |
| `bug_found_by_reviewer` | -10 |
| `bug_found_by_qa` | -15 |
| `rule_learned` | +15 |
| `blocker_detected_early` | +20 |
| `successful_deploy` | +35 |
| `feature_implemented` | +20 |
| `bug_fixed` | +15 |

### 4.6 Agent Stats (`agent-stats.json` — existing format, preserved)

```json
{
  "backend": {
    "totalXp": 245,
    "level": 5,
    "skills": { "implementation": 3, "debugging": 2 },
    "attributes": {
      "str": 14, "dex": 12, "con": 13,
      "int": 11, "wis": 10, "cha": 10
    }
  }
}
```

Attributes: str (implementation quality), dex (speed/efficiency), con (consistency), int (design/architecture), wis (review/testing insight), cha (communication clarity).

---

## 5. Claude Code Integration

### 5.1 Scheduled Task Configuration

Each agent is configured as a Claude Code scheduled task. No SDK, no daemon, no API key needed.

**Coordinator scheduled task:**
```
Name: Pipeline Coordinator
Schedule: 0 0,12,14,16,18,20,22 * * * (America/Los_Angeles)
Model: claude-sonnet-4-6
Prompt: [contents of prompts/coordinator.md]
```

**Work agent scheduled tasks (one per agent):**
```
Name: Pipeline {Agent}
Schedule: 0 13,15,17,19,21,23 * * * (America/Los_Angeles)
Model: claude-sonnet-4-6 (or claude-opus-4-6 for architect/reviewer)
Prompt: [contents of prompts/{agent}.md]
```

### 5.2 How a Scheduled Task Run Works

1. Claude Code fires the scheduled task on the cron schedule
2. Claude Code starts a session with the agent's task prompt + CLAUDE.md context
3. The agent reads the pipeline directory to scan for projects and evaluate trigger conditions
4. If no trigger conditions are met → agent reports "no work" and exits
5. If work is found → agent reads relevant artifacts, does the work, writes output files directly
6. Agent runs `scripts/validate-artifact.sh` to validate its output
7. Agent writes `handoff-{slug}.md` for downstream context
8. Agent runs `scripts/xp-log.sh` to log XP events
9. Agent appends to `data/run-log.jsonl`
10. (Coordinator only) Agent runs `scripts/telegram-send.sh` with sync message

**Key difference from daemon model:** Claude Code reads and writes files directly using its native tools. No `<<<WRITE_FILE>>>` markers, no response parsing, no custom conversation store. The agent IS Claude Code.

### 5.3 Artifact Ownership Enforcement

Enforced via instructions in `CLAUDE.md` and each agent's task prompt. The `CLAUDE.md` includes the full ownership matrix:

| Agent | Can Write | Can Delete |
|---|---|---|
| coordinator | TRACKER.md, DASHBOARD.md, PHASE.md, context-*.md, bugs-*.md (coordinator-tagged) | — |
| pm | prd-*.md, stories-*.md | needs-revision-prd-*.md (after processing) |
| architect | tdd-*.md, api-*.md | needs-revision-tdd-*.md (after processing) |
| backend | impl-backend-*.md, patch-*.md | — |
| frontend | impl-frontend-*.md, patch-*.md | — |
| reviewer | review-*.md | bugs-*.md, testplan-*.md (on bug-fix re-review approval) |
| qa | testplan-*.md, bugs-*.md | — |
| devops | deploy-*.md, done-*.md | — |

Additionally, the validation script can check that only allowed file prefixes were modified.

### 5.4 Cost Model

**Claude Code scheduled tasks are covered by the Claude plan.** No per-token API billing.

Estimated daily usage:
- Coordinator: 7 scheduled runs (most are quick scans)
- Work agents: 6 agents x 6 scheduled runs = 36 runs (most exit early with "no work")
- Active agent runs (with real work): ~3-8 per day depending on pipeline activity

**Total: $0/day in API costs** (covered by Claude plan, vs ~$1-2.50/day with direct API calls)

---

## 6. Configuration

### 6.1 config.yaml

```yaml
# Pipeline Orchestrator Configuration
# Used by helper scripts for directory paths and credentials

pipeline:
  dir: /Users/wynclaw/.openclaw/shared/pipeline
  conventionsFile: CONVENTIONS.md  # relative to pipeline.dir

data:
  dir: ./data  # run logs
  rulesDir: ./rules  # RULES.md files per agent

telegram:
  botToken: ${TELEGRAM_BOT_TOKEN}
  chatId: "8153891546"
```

### 6.2 Environment Variables

```
TELEGRAM_BOT_TOKEN=...
```

Note: `ANTHROPIC_API_KEY` is no longer required — Claude Code handles authentication via the user's Claude plan.

### 6.3 Claude Code Scheduled Task Setup

Scheduled tasks are configured via `claude.ai/code/scheduled` or the `/schedule` CLI command. Each agent needs a task created with:
- **Name:** Pipeline {Agent}
- **Repository:** pipeline-orchestrator
- **Schedule:** Cron expression (see Section 5.1)
- **Model:** Per agent (see Section 4.1)
- **Prompt:** Contents of `prompts/{agent}.md`

---

## 7. Migration Plan

### 7.1 Directory Strategy

**Decision: Keep using `/Users/wynclaw/.openclaw/shared/pipeline/` as the default path.**

Rationale:
- 11 project directories are already there with established artifacts
- Agent RULES.md files reference this path
- CONVENTIONS.md references this path
- Changing it means updating every hardcoded path in CONVENTIONS.md and all rules
- The `pipeline.dir` config key in `config.yaml` allows changing it later

**What lives in the orchestrator repo:**
- `CLAUDE.md` — shared conventions (read by Claude Code automatically)
- `rules/` — per-agent RULES.md files
- `prompts/` — agent task prompts
- `scripts/` — helper scripts
- `data/run-log.jsonl` — run log
- `config.yaml` — pipeline configuration

**What stays in the pipeline directory (no migration needed):**
- All project directories and artifacts
- CONVENTIONS.md
- DASHBOARD.md
- `agent-events.jsonl` → stays at `/Users/wynclaw/.openclaw/shared/agent-events.jsonl`
- `agent-stats.json` → stays at `/Users/wynclaw/.openclaw/shared/agent-stats.json`

### 7.2 RULES.md Migration

OpenClaw stored RULES.md in per-agent workspace directories (e.g. `workspace-backend/RULES.md`). Copy the existing RULES.md files into `./rules/{agent}.md`. Each agent's task prompt references its rules file.

### 7.3 CONVENTIONS.md Update

Update CONVENTIONS.md to:
1. Remove references to OpenClaw-specific concepts (sessions, delivery channels)
2. Update the XP event logging instruction (agents call `scripts/xp-log.sh` instead of bash `echo >>`)
3. Keep all artifact naming, phase, review, and bug conventions unchanged

### 7.4 Backward Compatibility

- Existing TRACKER.md and DASHBOARD.md formats are preserved exactly
- Existing PHASE.md format is preserved exactly
- Existing artifact naming is preserved exactly
- XP event JSONL format is preserved exactly
- agent-stats.json format is preserved exactly
- The Claude Code scheduled tasks are a drop-in replacement for the daemon — same inputs, same outputs, same filesystem conventions

---

## 8. Task Breakdown

Tasks are ordered by dependency. Each task produces a testable increment. The scope is dramatically reduced compared to the daemon architecture — most of the work is prompt writing and lightweight scripting.

### Phase 1: Foundation

**Task 1: Project setup**
- Create directory structure: `prompts/`, `rules/`, `scripts/`, `data/`
- Create `config.yaml` with pipeline directory path and Telegram credentials
- Create `CLAUDE.md` with pipeline conventions, artifact ownership matrix, and helper script references
- **Depends on:** nothing

**Task 2: RULES.md migration**
- Copy existing RULES.md files from OpenClaw workspace dirs into `./rules/{agent}.md`
- **Depends on:** Task 1

**Task 3: CONVENTIONS.md update**
- Update CONVENTIONS.md to remove OpenClaw-specific references
- Update XP logging instructions (agents call `scripts/xp-log.sh`)
- Keep all artifact naming, phase, review, and bug conventions unchanged
- **Depends on:** Task 1

### Phase 2: Helper Scripts

**Task 4: Validation script**
- Write `scripts/validate-artifact.sh` — structural validation for PRD, TDD, review, QA artifacts
- Uses `grep` to check for required sections/headers
- Returns exit code 0 (valid) or 1 (invalid with error messages)
- Test: validate a known-good PRD passes, a bad PRD fails
- **Depends on:** Task 1

**Task 5: XP tracking scripts**
- Write `scripts/xp-log.sh` — appends XP event JSON to `agent-events.jsonl`
- Write `scripts/xp-stats.sh` — rebuilds `agent-stats.json` from events
- Preserves existing JSONL and JSON formats exactly
- **Depends on:** Task 1

**Task 6: Telegram delivery script**
- Write `scripts/telegram-send.sh` — POSTs to Telegram Bot API
- Reads bot token and chat ID from environment or config
- Test: send a test message
- **Depends on:** Task 1

**Task 7: CLI scripts**
- Write `scripts/pipeline-status.sh` — display DASHBOARD.md
- Write `scripts/pipeline-start.sh` — create project dir with TRACKER.md + PHASE.md
- Write `scripts/pipeline-kick.sh` — trigger agent via `claude` CLI
- Write `scripts/pipeline-stats.sh` — display Pipeline Quest stats
- Write `scripts/pipeline-logs.sh` — show recent run history
- **Depends on:** Tasks 5, 6

### Phase 3: Agent Prompts

**Task 8: Coordinator prompt**
- Write `prompts/coordinator.md` with full coordinator behavior:
  - Scan all projects, read TRACKER.md/PHASE.md/artifacts
  - Update TRACKER.md and DASHBOARD.md
  - Detect staleness (TDD vs impl timestamps)
  - Compose and send Telegram sync message
  - Flag deploy-ready projects for Nathan
- Test: run manually via `claude` CLI, verify output
- **Depends on:** Tasks 1, 6

**Task 9: PM prompt**
- Write `prompts/pm.md` with trigger conditions, PRD writing instructions, output format
- Test: run against a test project with TRACKER.md only
- **Depends on:** Task 1

**Task 10: Architect prompt**
- Write `prompts/architect.md` with trigger conditions, TDD writing instructions
- **Depends on:** Task 1

**Task 11: Backend + Frontend prompts**
- Write `prompts/backend.md` and `prompts/frontend.md`
- Include trigger conditions for initial impl, changes requested, and bug fixes
- **Depends on:** Task 1

**Task 12: Reviewer prompt**
- Write `prompts/reviewer.md` with all 3 trigger conditions (initial review, ERS re-review, bug-fix re-review)
- **Depends on:** Task 1

**Task 13: QA + DevOps prompts**
- Write `prompts/qa.md` and `prompts/devops.md`
- **Depends on:** Task 1

### Phase 4: Scheduled Task Setup + Testing

**Task 14: Create Claude Code scheduled tasks**
- Configure 7 scheduled tasks (coordinator + 6 work agents) via Claude Code
- Set correct cron expressions, models, and prompts for each
- DevOps remains manual-only (no scheduled task)
- **Depends on:** Tasks 8-13

**Task 15: Integration testing**
- Run full pipeline cycle against a test project: create → PM → Architect → Backend → Review → QA
- Verify scheduled task timing, validation, Telegram delivery, XP logging
- Verify existing 11 project directories are unaffected (read-only validation)
- **Depends on:** Task 14

**Task 16: Cutover**
- Verify all scheduled tasks are running correctly
- Confirm no OpenClaw cron jobs remain active (already disabled)
- Monitor first 24 hours of scheduled task operation
- **Depends on:** Task 15

---

## Appendix A: Artifact Ownership Matrix

| Agent | Can Write | Can Delete |
|---|---|---|
| coordinator | TRACKER.md, DASHBOARD.md, PHASE.md, context-*.md, bugs-*.md (coordinator-tagged) | — |
| pm | prd-*.md, stories-*.md | needs-revision-prd-*.md (after processing) |
| architect | tdd-*.md, api-*.md | needs-revision-tdd-*.md (after processing) |
| backend | impl-backend-*.md, patch-*.md | — |
| frontend | impl-frontend-*.md, patch-*.md | — |
| reviewer | review-*.md | bugs-*.md, testplan-*.md (on bug-fix re-review approval) |
| qa | testplan-*.md, bugs-*.md | — |
| devops | deploy-*.md, done-*.md | — |
| any agent | needs-clarification.md | — |

Backend and frontend can also modify `review-*.md` (to change verdict to ERS and append Engineer Response section) and `bugs-*.md` (to mark bugs Fixed).

## Appendix B: Open Questions Resolution (Recommendations)

| # | Question | Recommendation |
|---|---|---|
| 1 | Directory path | Keep `/Users/wynclaw/.openclaw/shared/pipeline/` — configurable via `pipeline.dir` in config.yaml. Rename later if desired. |
| 2 | Cloud vs Desktop tasks | Desktop scheduled tasks recommended initially (full local filesystem access). Cloud tasks require repo sync strategy for the pipeline directory. |
| 3 | Event-driven triggers | Start with scheduled-only mode. Add event-driven triggers (file-watcher script + `claude` CLI) as a Phase 2 enhancement if cron-only feels too slow. |
| 4 | Validation approach | Hybrid: lightweight bash scripts for deterministic structural checks + prompt instructions for semantic validation. |
| 5 | Cost | $0/day in API costs (Claude plan). The only cost is the Claude subscription itself. |
