# Pipeline Orchestrator

A self-hosted Node.js/TypeScript service that manages a multi-agent development pipeline using the Claude API. Replaces the OpenClaw-based pipeline with direct API calls, cron scheduling, event-driven handoffs, and validation gates.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export TELEGRAM_BOT_TOKEN=...

# Start the daemon (foreground)
npm start

# Start the daemon (PM2 — survives reboots)
pm2 start ecosystem.config.js
```

## CLI Commands

All commands available via `npx pipeline <command>` or `node dist/cli/cli.js <command>`.

```bash
# Show pipeline dashboard (reads DASHBOARD.md)
npx pipeline status

# Create a new project — creates TRACKER.md + PHASE.md, triggers PM
npx pipeline start my-new-project

# Manually trigger an agent run (requires daemon running)
npx pipeline kick backend
npx pipeline kick reviewer --project restock-monitor

# Show Pipeline Quest agent levels and XP
npx pipeline stats

# Show recent run history for an agent
npx pipeline logs coordinator
npx pipeline logs backend --lines 50

# Show scheduled cron jobs and their status
npx pipeline cron list
```

## Architecture

### How a Pipeline Run Works

1. **Cron tick** fires (coordinator on even hours, agents on odd hours)
2. **Pipeline scanner** reads all project directories, builds a `PipelineState` snapshot
3. **Dispatcher** evaluates trigger conditions for each agent against the state
4. **Pre-check** (Haiku) confirms the agent has real work — skips if not
5. **Agent runner** calls Claude API (Sonnet/Opus) with composed system prompt
6. **Response parser** extracts `<<<WRITE_FILE>>>` / `<<<DELETE_FILE>>>` markers
7. **Artifact ownership** enforced — agents can only write their own file types
8. **Validation gate** (Haiku) checks structural requirements on new artifacts
9. **Handoff summary** (Haiku) generates context for the downstream agent
10. **XP tracking** logs events to `agent-events.jsonl`, rebuilds stats
11. **Telegram delivery** sends coordinator sync messages to your phone

### Scheduling

| Schedule | Agents | Cron |
|---|---|---|
| Coordinator sync | coordinator | `0 0,12,14,16,18,20,22 * * *` PT |
| Agent work cycle | pm, architect, backend, frontend, reviewer, qa | `0 13,15,17,19,21,23 * * *` PT |

Active window: 12 PM – 12 AM Pacific daily. Three modes:

- **cron** — OpenClaw-compatible polling on schedule
- **event** — immediate dispatch on file change (chokidar)
- **hybrid** (default) — events during active hours, cron as fallback

### Agent Model Assignment

| Agent | Model | Role |
|---|---|---|
| coordinator | claude-sonnet-4-6 | Sync tracker/dashboard, Telegram delivery |
| pm | claude-sonnet-4-6 | Write PRDs and user stories |
| architect | claude-opus-4-6 | Write TDDs and API specs |
| backend | claude-sonnet-4-6 | Backend implementation |
| frontend | claude-sonnet-4-6 | Frontend implementation |
| reviewer | claude-opus-4-6 | Code review |
| qa | claude-sonnet-4-6 | Test plans and bug reports |
| devops | claude-sonnet-4-6 | Deploy plans (manual trigger only) |
| (validation/pre-check) | claude-haiku-4-5 | Cheap structural checks |

### Pipeline Stages

```
Requirements → Design → Implementation → Review → QA → Deploy → Complete
     PM        Architect   Backend/Frontend  Reviewer  QA    DevOps
```

Deploy is always manual — the coordinator flags Nathan when a project reaches deploy.

### Key Directories

| Path | Purpose |
|---|---|
| `/Users/wynclaw/.openclaw/shared/pipeline/` | Shared pipeline directory (all project artifacts) |
| `./rules/` | Agent RULES.md files (injected into system prompts) |
| `./data/conversations/` | Per-agent per-project conversation history (JSONL) |
| `./data/run-log.jsonl` | Run log (every agent execution) |
| `./config.yaml` | Main configuration file |

## Project Structure

```
src/
├── index.ts                          # Daemon entry point
├── config.ts                         # Config loader (config.yaml + env vars)
├── types.ts                          # All TypeScript types
│
├── orchestrator/
│   ├── orchestrator.ts               # Main run loop (scan → dispatch → run → validate → handoff)
│   ├── dispatcher.ts                 # Agent trigger conditions (PipelineState → DispatchDecision[])
│   └── pipeline-scanner.ts           # Scans pipeline dir, builds PipelineState snapshot
│
├── agents/
│   ├── agent-runner.ts               # Claude API calls, response parsing, file operations
│   ├── prompt-composer.ts            # 6-section system prompt assembly
│   ├── conversation-store.ts         # JSONL conversation history
│   └── prompts/                      # Per-agent prompt templates (ported from OpenClaw)
│       ├── coordinator.ts
│       ├── pm.ts
│       ├── architect.ts
│       ├── backend.ts
│       ├── frontend.ts
│       ├── reviewer.ts
│       ├── qa.ts
│       └── devops.ts
│
├── scheduler/
│   ├── scheduler.ts                  # node-cron job management
│   └── schedule-config.ts            # Cron expressions and schedule definitions
│
├── watcher/
│   ├── file-watcher.ts               # Chokidar file monitoring
│   └── event-dispatcher.ts           # File change → agent dispatch mapping
│
├── validator/
│   ├── validator.ts                  # Validation gate orchestrator
│   ├── pre-check.ts                  # "Is there work?" Haiku check
│   └── gates/
│       ├── prd-gate.ts               # PRD must have: Problem Statement, Goals, User Stories, AC, Scope
│       ├── tdd-gate.ts               # TDD must reference PRD, have: Architecture, Data Model, API, Tasks
│       ├── review-gate.ts            # Must contain exactly one valid verdict
│       └── qa-gate.ts                # Test plan must trace to PRD acceptance criteria
│
├── state/
│   ├── phase-manager.ts              # PHASE.md read/write, artifact suffix logic
│   ├── artifact-resolver.ts          # Slug detection, phase-aware artifact filename resolution
│   ├── review-cycle.ts               # Review verdict parsing, bug state parsing
│   ├── staleness-detector.ts         # TDD vs impl timestamp comparison
│   └── handoff-manager.ts            # Post-run context summaries via Haiku
│
├── quest/
│   ├── xp-tracker.ts                 # Appends to agent-events.jsonl
│   ├── stats-manager.ts              # Reads/writes agent-stats.json
│   └── xp-table.ts                   # XP values per event type
│
├── telegram/
│   └── telegram.ts                   # Telegram Bot API sendMessage
│
└── cli/
    ├── cli.ts                        # Commander.js CLI entry
    ├── ipc.ts                        # Unix socket IPC client
    └── commands/
        ├── status.ts                 # pipeline status
        ├── start.ts                  # pipeline start <project>
        ├── kick.ts                   # pipeline kick <agent>
        ├── stats.ts                  # pipeline stats
        ├── logs.ts                   # pipeline logs <agent>
        └── cron.ts                   # pipeline cron list
```

## Configuration

All settings in `config.yaml`. Environment variables are referenced as `${VAR_NAME}`.

Key settings:
- `scheduling.mode`: `cron` | `event` | `hybrid` (default: hybrid)
- `agents.<name>.model`: model per agent
- `agents.<name>.timeoutMs`: API call timeout
- `validation.enabled`: toggle Haiku validation gates
- `precheck.enabled`: toggle Haiku pre-checks

## Cutover from OpenClaw

1. Set `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN` environment variables
2. `npm run build && pm2 start ecosystem.config.js`
3. Run `./scripts/update-conventions.sh` to update XP logging instructions in CONVENTIONS.md
4. OpenClaw cron jobs are already disabled (usage limits) — no conflict

The orchestrator reads/writes the same pipeline directory (`/Users/wynclaw/.openclaw/shared/pipeline/`), uses the same artifact naming, same TRACKER.md/DASHBOARD.md formats, same XP event format. All 11 existing projects work as-is.

## Development

```bash
npm run build     # Compile TypeScript
npm run dev       # Watch mode (recompile on changes)
npm start         # Run the daemon
npm run cli       # Run CLI directly
```
