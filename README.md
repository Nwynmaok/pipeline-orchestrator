# Pipeline Orchestrator

A multi-agent software development pipeline powered by Claude Code scheduled tasks. Nine specialized AI agents collaborate to take projects from requirements through deployment — each running as an autonomous Claude Code session on a cron schedule.

## How It Works

Each agent runs as a Claude Code Desktop scheduled task on a Mac Mini. On each cron tick, an agent:

1. Reads the shared pipeline directory and scans for projects
2. Evaluates trigger conditions (e.g., "is there a PRD ready for architecture?")
3. Reads relevant artifacts and does the work
4. Writes output files to the project directory
5. Validates output with `scripts/validate-artifact.sh`
6. Writes a `handoff-{slug}.md` summary for the next agent downstream
7. Logs XP to the Pipeline Quest gamification system

The coordinator agent sends Telegram sync messages after each run, and a poller picks up replies so the project owner can provide clarifications without leaving Telegram.

## Pipeline Stages

```
Requirements -> Design -> Implementation -> Review -> QA -> Deploy -> Complete
     PM        Architect  Backend/Frontend  Reviewer  QA    DevOps
```

Deploy is always manual — the coordinator flags the project owner when a project reaches deploy readiness.

## Agents

| Agent | Role | Model | Schedule (PT) |
|---|---|---|---|
| Coordinator | Scan projects, update tracker/dashboard, send Telegram syncs | Sonnet 4.6 | Even hours, 12pm-12am |
| PM | Write PRDs and user stories from intake notes | Sonnet 4.6 | Odd hours, 1pm-11pm |
| Architect | Write TDDs and API specs from PRDs | **Opus 4.6** | Odd hours, 1pm-11pm |
| Backend | Backend implementation, review fixes, bug fixes | Sonnet 4.6 | Odd hours, 1pm-11pm |
| Frontend | Frontend implementation, review fixes, bug fixes | Sonnet 4.6 | Odd hours, 1pm-11pm |
| Reviewer | Code review, re-review after engineer fixes | **Opus 4.6** | Odd hours, 1pm-11pm |
| QA | Test plans and bug reports against PRD acceptance criteria | Sonnet 4.6 | Odd hours, 1pm-11pm |
| Telegram Poller | Poll for replies, resolve needs-clarification files | Sonnet 4.6 | Every 5 minutes |
| DevOps | Deploy projects that pass QA | Sonnet 4.6 | Manual only |

The coordinator runs on even hours, work agents on odd hours — so the coordinator always has fresh state to report.

## Project Structure

All project artifacts live in a shared pipeline directory (default: `~/.openclaw/shared/pipeline/`). Each project is a subdirectory containing:

- `TRACKER.md` — project status and history
- `PHASE.md` — current phase number
- `prd-{slug}.md` — product requirements
- `tdd-{slug}.md` — technical design document
- `impl-backend-{slug}.md` / `impl-frontend-{slug}.md` — implementation artifacts
- `review-{slug}.md` — code review with verdict
- `testplan-{slug}.md` / `bugs-{slug}.md` — QA artifacts
- `handoff-{slug}.md` — context summary for downstream agents
- `needs-clarification.md` — blocks pipeline until owner responds

## Review Cycle

Reviews produce one of four verdicts:

- **Approved** — QA proceeds
- **Approved with Comments** — minor observations, QA proceeds
- **Changes Requested** — blocking issues, engineer must fix
- **Engineer Response Submitted** — engineer addressed feedback, reviewer re-reviews

If bugs are found by QA, the engineer fixes them, the reviewer re-reviews, and QA re-runs on approval.

## Clarification Flow

When any agent is blocked, it writes `needs-clarification.md`. The coordinator escalates this to Telegram. When the owner replies, the Telegram poller writes `context-{slug}.md` and deletes the blocking file, unblocking the pipeline.

## CLI Scripts

```bash
# Dashboard
scripts/pipeline-status.sh

# Agent XP levels
scripts/pipeline-stats.sh

# Recent run history
scripts/pipeline-logs.sh [agent] [--lines N]

# Create a new project
scripts/pipeline-start.sh <project-name>

# Manually trigger an agent
scripts/pipeline-kick.sh <agent> [--project <project-name>]

# Send a Telegram message (coordinator)
scripts/telegram-send.sh "<message>"

# Validate an artifact
scripts/validate-artifact.sh <type> <file>
```

## Setup

See [SETUP.md](SETUP.md) for the full guide on configuring scheduled tasks in Claude Code Desktop.

In short:

1. Install Claude Code Desktop on your Mac Mini
2. Create 8 scheduled tasks (one per agent + Telegram poller) in the Schedule tab
3. Set each task's working folder to this repo, model per the table above, and permission mode to Auto
4. Copy prompts from the `prompts/` directory into each task
5. Set `TELEGRAM_BOT_TOKEN` in your environment
6. Run each task once to verify permissions

There is also an optional **Cowork full-cycle task** that pushes a project through all stages in one autonomous session, useful for rapid iteration without waiting for cron ticks.

## Pipeline Quest (XP System)

Agents earn or lose XP based on their work quality:

| Event | XP |
|---|---|
| Clean review pass (first try) | +25 |
| Clean QA pass (first try) | +30 |
| Successful deploy | +35 |
| Feature implemented | +20 |
| Blocker detected early | +20 |
| Bug fixed | +15 |
| Rule learned | +15 |
| Bug found by reviewer | -10 |
| Bug found by QA | -15 |

Each agent also maintains learned rules in `rules/{agent}.md` to avoid repeating past mistakes.

## Configuration

`config.yaml` at the repo root controls paths and Telegram credentials:

```yaml
pipeline:
  dir: /path/to/shared/pipeline
telegram:
  botToken: ${TELEGRAM_BOT_TOKEN}
  chatId: "your-chat-id"
```
