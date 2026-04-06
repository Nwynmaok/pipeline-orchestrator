# Pipeline Orchestrator

A multi-agent development pipeline powered by Claude Code scheduled tasks. Each pipeline agent runs as a scheduled Claude Code session that reads project state from the filesystem and writes artifacts directly.

## Pipeline Directory

All project artifacts live in the shared pipeline directory configured in `config.yaml` (default: `/Users/wynclaw/.openclaw/shared/pipeline/`).

Each project is a subdirectory containing: TRACKER.md, PHASE.md, and artifact files (prd-*.md, tdd-*.md, impl-*.md, review-*.md, etc.).

## How It Works

See **SETUP.md** for the full guide on configuring scheduled tasks and the Cowork full-cycle task in Claude Code Desktop.

In short:
1. Claude Code scheduled task fires on cron schedule (or run the Cowork full-cycle task to push projects through all stages at once)
2. Agent reads pipeline directory, scans for projects, evaluates trigger conditions
3. If work is found, agent reads relevant artifacts and does the work
4. Agent writes output files directly to the project directory
5. Agent runs `scripts/validate-artifact.sh` to validate output
6. Agent writes `handoff-{slug}.md` for downstream context
7. Agent runs `scripts/xp-log.sh` to log XP events
8. Coordinator runs `scripts/telegram-send.sh` with sync message

## CLI Scripts

Shell scripts for monitoring and manual control. Run from the repo root.

```bash
# Show pipeline dashboard (reads DASHBOARD.md)
scripts/pipeline-status.sh

# Show Pipeline Quest agent levels and XP
scripts/pipeline-stats.sh

# Show recent run history for an agent
scripts/pipeline-logs.sh [agent] [--lines N]

# Create a new project
scripts/pipeline-start.sh <project-name>

# Manually trigger an agent run
scripts/pipeline-kick.sh <agent> [--project <project-name>]
```

## Agent Schedule

| Agent | Cron (PT) | Model |
|---|---|---|
| coordinator | `0 0,12,14,16,18,20,22 * * *` | claude-sonnet-4-6 |
| pm | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 |
| architect | `0 13,15,17,19,21,23 * * *` | claude-opus-4-6 |
| backend | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 |
| frontend | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 |
| reviewer | `0 13,15,17,19,21,23 * * *` | claude-opus-4-6 |
| qa | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 |
| devops | Manual only | claude-sonnet-4-6 |

Active window: 12 PM - 12 AM Pacific daily.

## Pipeline Stages

```
Requirements -> Design -> Implementation -> Review -> QA -> Deploy -> Complete
     PM        Architect   Backend/Frontend  Reviewer  QA    DevOps
```

Deploy is always manual -- the coordinator flags Nathan when a project reaches deploy.

## Artifact Ownership

Each agent may ONLY write the file types listed below. Do not write files outside your ownership.

| Agent | Can Write | Can Delete |
|---|---|---|
| coordinator | TRACKER.md, DASHBOARD.md, PHASE.md, context-*.md, bugs-*.md (coordinator-tagged) | -- |
| pm | prd-*.md, stories-*.md | needs-revision-prd-*.md (after processing) |
| architect | tdd-*.md, api-*.md | needs-revision-tdd-*.md (after processing) |
| backend | impl-backend-*.md, patch-*.md | -- |
| frontend | impl-frontend-*.md, patch-*.md | -- |
| reviewer | review-*.md | bugs-*.md, testplan-*.md (on bug-fix re-review approval) |
| qa | testplan-*.md, bugs-*.md | -- |
| devops | deploy-*.md, done-*.md | -- |
| any agent | needs-clarification.md | -- |

Backend and frontend may also modify: review-*.md (to change verdict to ERS + append Engineer Response section), bugs-*.md (to mark bugs Fixed).

## Phase Conventions

- Every project has a PHASE.md with `Current Phase: N`
- Phase 1 artifacts use flat naming: `tdd-{slug}.md`
- Phase 2+ artifacts use suffixed naming: `tdd-{slug}-phaseN.md`
- Read PHASE.md FIRST on every run to determine current phase
- Only the coordinator may increment PHASE.md

## Review Cycle

Verdicts (exactly one per review file):
- **Approved** -- QA proceeds
- **Approved with Comments** -- minor non-blocking observations, QA proceeds
- **Changes Requested** -- blocking issues, engineer must fix
- **Engineer Response Submitted** -- engineer has addressed feedback, reviewer re-reviews

Flag sections (block engineer action, require Nathan):
- `## Warning: TDD Issue -- Nathan Action Required` -- design flaw
- `## Warning: PRD Issue -- Nathan Action Required` -- requirements flaw

## Bug Fix Cycle

1. QA files bugs in `bugs-{slug}.md`
2. Engineer marks bugs as Fixed, updates review verdict to ERS
3. Reviewer re-reviews: deletes `bugs-*.md` + `testplan-*.md`, writes fresh review
4. If Approved, QA re-triggers

## Post-QA Artifact Freeze

After QA passes, impl files are frozen. Any changes go in `patch-{slug}.md`.

## Special Files

- `needs-revision-prd-{slug}.md` -- Nathan-authored; PM picks up and revises PRD
- `needs-revision-tdd-{slug}.md` -- Nathan-authored; Architect picks up and revises TDD
- `needs-clarification.md` -- any agent writes when blocked; coordinator escalates to Nathan
- `context-{slug}.md` -- coordinator-authored correction notes for a specific agent
- `patch-{slug}.md` -- post-QA changes (frozen impl files)
- `handoff-{slug}.md` -- upstream agent's context summary for downstream agent

## Helper Scripts

All scripts are in the `scripts/` directory. Run them after completing work:

- `scripts/validate-artifact.sh <type> <file>` -- validate artifact structure (types: prd, tdd, review, qa)
- `scripts/xp-log.sh <agent> <event> <project> "<note>"` -- log XP event
- `scripts/xp-stats.sh` -- rebuild agent-stats.json from events
- `scripts/telegram-send.sh "<message>"` -- send Telegram message (coordinator only)

## XP Events

| Event | XP | When |
|---|---|---|
| clean_pass_review | +25 | Review passes with Approved on first try |
| clean_pass_qa | +30 | QA passes with no bugs on first try |
| bug_found_by_reviewer | -10 | Reviewer finds bugs in implementation |
| bug_found_by_qa | -15 | QA finds bugs after review passed |
| rule_learned | +15 | Agent adds a new rule to RULES.md |
| blocker_detected_early | +20 | Agent detects blocker before downstream |
| successful_deploy | +35 | Project deployed successfully |
| feature_implemented | +20 | Agent completes a feature implementation |
| bug_fixed | +15 | Agent fixes a bug |

## Agent Rules

Each agent has learned rules in `rules/{agent}.md`. Read your rules file before starting work. Follow them to avoid repeating past mistakes.
