# Setup Guide: Pipeline Orchestrator via Claude Code Desktop

This guide walks you through configuring the pipeline orchestrator as Claude Code Desktop scheduled tasks on your Mac Mini.

## Prerequisites

- [ ] Claude Code Desktop app installed and signed in to your Claude plan
- [ ] This repo cloned to your Mac Mini (e.g., `/Users/wynclaw/projects/pipeline-orchestrator`)
- [ ] Pipeline directory exists at `/Users/wynclaw/.openclaw/shared/pipeline/` with your 11 projects
- [ ] `TELEGRAM_BOT_TOKEN` added to `~/.claude/settings.json` under `"env"` (required for Telegram delivery in scheduled task context)

## Step 1: Open Claude Code Desktop

Launch the Claude Code Desktop app on your Mac Mini. This app needs to stay running — it replaces PM2 as the always-on process that manages scheduling.

## Step 2: Create the Bootstrap Scheduled Task

The pipeline uses a **bootstrap** approach: one durable Desktop task fires daily at 11am, clears any leftover cron jobs from previous days, and registers all 8 agent tasks fresh for the current session.

> **Why bootstrap instead of 8 direct Desktop tasks?**
> The Desktop UI's custom cron option requires describing the schedule in natural language and doesn't expose raw cron expressions. The bootstrap works around this by using Claude Code's `CronCreate` tool to register jobs with exact cron syntax at runtime.

Create a single task in the **Schedule** tab:

1. Click **New task** → **New local task**
2. Fill in the fields:

| Field | Value |
|---|---|
| Name | `pipeline-scheduler-bootstrap` |
| Description | Daily bootstrap: clear old pipeline cron jobs and register 8 fresh agent tasks |
| Model | claude-sonnet-4-6 |
| Frequency | Daily — 11am (before the active window starts at noon) |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/bootstrap.md` |

When the bootstrap fires, it:
1. Calls `CronList` and deletes any existing pipeline cron jobs (prevents duplicates if Desktop stays open across days)
2. Reads each `prompts/*.md` file and registers all 8 agent tasks via `CronCreate`
3. Confirms with a summary of jobs created

### Agent Tasks (registered by bootstrap, not created manually)

The bootstrap registers these 8 tasks automatically:

| Agent | Cron (PT) | Model | Prompt File |
|---|---|---|---|
| pipeline-coordinator | `0 0,12,14,16,18,20,22 * * *` | claude-sonnet-4-6 | `prompts/coordinator.md` |
| pipeline-pm | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 | `prompts/pm.md` |
| pipeline-architect | `0 13,15,17,19,21,23 * * *` | claude-opus-4-6 | `prompts/architect.md` |
| pipeline-backend | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 | `prompts/backend.md` |
| pipeline-frontend | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 | `prompts/frontend.md` |
| pipeline-reviewer | `0 13,15,17,19,21,23 * * *` | claude-opus-4-6 | `prompts/reviewer.md` |
| pipeline-qa | `0 13,15,17,19,21,23 * * *` | claude-sonnet-4-6 | `prompts/qa.md` |
| pipeline-telegram-poll | `*/5 * * * *` | claude-sonnet-4-6 | `prompts/telegram-poll.md` |

### DevOps (no scheduled task)

DevOps is manual-only. When the coordinator flags a project as ready for deploy, kick it manually:
```bash
./scripts/pipeline-kick.sh devops --project <project-name>
```

### Updating Prompts

To update an agent's prompt, edit the file in `prompts/`. The change takes effect the next time the bootstrap runs (next day at 11am), or immediately if you **Run now** the bootstrap task to re-register jobs.

## Step 2b: Cowork Full Cycle Task (Optional)

In addition to the scheduled tasks, you can set up a **Cowork task** that runs the entire pipeline in one shot — all agents in stage order, in a single autonomous session. This is useful when you want to push a project through multiple stages without waiting for hourly cron ticks.

1. Open the **Cowork** tab in Claude Desktop (alongside Chat and Code)
2. Create a new task with the contents of `prompts/cowork-full-cycle.md`
3. Save it for reuse

**When to use it:**
- You just created a new project and want it to go from intake notes through PRD, TDD, impl, review, and QA immediately
- Multiple projects have been sitting idle and you want to flush the whole pipeline
- You're actively iterating on a project and don't want to wait for the next cron window

**When NOT to use it:**
- For routine daily operation — the scheduled tasks handle that automatically
- When you only need one agent to run — use `./scripts/pipeline-kick.sh <agent>` instead

## Step 3: First Run Test

After creating all 8 tasks:

1. Click each task and hit **Run now** to trigger an immediate test run
2. Watch the session output — each agent should scan the pipeline directory and either find work or report "no work found"
3. Check that the coordinator produces a Telegram sync message
4. If any task hits a permission prompt, click **Always allow** so future runs don't stall

## Step 4: Verify Permissions

Each task runs in Auto mode, but the first run may encounter new tool permissions. After the initial test runs:

1. Click each task in the Schedule tab
2. Click **Review allowed permissions**
3. Ensure file read/write and bash execution are allowed
4. If any are missing, do another **Run now** and approve them

## Step 5: Monitor

- **Schedule tab** — shows all tasks, next run time, and run history
- **Scheduled section in sidebar** — shows active and recent sessions
- Click any past run to see the full session transcript
- Run `./scripts/pipeline-logs.sh` to see the run log
- Run `./scripts/pipeline-stats.sh` to see Pipeline Quest XP

## Notes

- **Staggering**: Desktop applies a 0-10 minute random offset per task to avoid API traffic spikes. All 6 work agents firing at the same odd hour will be spread across a ~10 minute window.
- **Sleep handling**: If your Mac Mini goes to sleep and misses a scheduled run, Desktop will catch up with one run when it wakes (within 7 days). Older misses are skipped.
- **Missed runs are fine**: Agents are idempotent — they scan for work each run. Missing a run just means the work gets picked up on the next one.
- **Updating prompts**: Edit the files in `prompts/` in this repo. Changes take effect the next time the bootstrap runs. To apply immediately, hit **Run now** on the bootstrap task — it will clear old jobs and re-register with the updated prompts.
- **Pausing**: Toggle the repeat off on any task to pause it without deleting. Toggle back on to resume.

## Troubleshooting

**Agent does nothing when there's work available:**
- Check the session transcript for errors
- Verify the working folder is set to this repo (so CLAUDE.md is loaded)
- Verify `config.yaml` has the correct pipeline directory path
- Check that the pipeline directory exists and contains project subdirectories

**Telegram not sending:**
- Verify `TELEGRAM_BOT_TOKEN` is set in `~/.claude/settings.json` under `"env"` (shell env vars are not inherited by scheduled tasks)
- Test manually: `./scripts/telegram-send.sh "test message"`

**Scripts fail with permission denied:**
- Run `chmod +x scripts/*.sh` from this repo directory

**Agent writes wrong file types:**
- The CLAUDE.md artifact ownership rules should prevent this. If it happens, add a rule to the agent's `rules/{agent}.md` file.
