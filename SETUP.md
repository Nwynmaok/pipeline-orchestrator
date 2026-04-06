# Setup Guide: Pipeline Orchestrator via Claude Code Desktop

This guide walks you through configuring the pipeline orchestrator as Claude Code Desktop scheduled tasks on your Mac Mini.

## Prerequisites

- [ ] Claude Code Desktop app installed and signed in to your Claude plan
- [ ] This repo cloned to your Mac Mini (e.g., `/Users/wynclaw/projects/pipeline-orchestrator`)
- [ ] Pipeline directory exists at `/Users/wynclaw/.openclaw/shared/pipeline/` with your 11 projects
- [ ] `TELEGRAM_BOT_TOKEN` environment variable set (for coordinator Telegram delivery)

## Step 1: Open Claude Code Desktop

Launch the Claude Code Desktop app on your Mac Mini. This app needs to stay running — it replaces PM2 as the always-on process that manages scheduling.

## Step 2: Create Scheduled Tasks

Open the **Schedule** tab in the sidebar, then create each of the 7 tasks below. For each task:

1. Click **New task** -> **New local task**
2. Fill in the fields as specified
3. Set the **Working Folder** to this repo's directory (e.g., `/Users/wynclaw/projects/pipeline-orchestrator`)
4. Set the **Model** using the model selector in the prompt input
5. Set **Permission Mode** to **Auto** (agents need to read/write files and run scripts without prompting)
6. Copy the prompt from the specified file in `prompts/`

### Task 1: Pipeline Coordinator

| Field | Value |
|---|---|
| Name | pipeline-coordinator |
| Description | Even-hour sync: scan projects, update tracker/dashboard, send Telegram |
| Model | claude-sonnet-4-6 |
| Frequency | Custom — ask Claude: "every 2 hours from 12pm to midnight PT" or set cron `0 0,12,14,16,18,20,22 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/coordinator.md` |

### Task 2: Pipeline PM

| Field | Value |
|---|---|
| Name | pipeline-pm |
| Description | Write PRDs and user stories from intake notes |
| Model | claude-sonnet-4-6 |
| Frequency | Custom — "odd hours from 1pm to 11pm PT" or cron `0 13,15,17,19,21,23 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/pm.md` |

### Task 3: Pipeline Architect

| Field | Value |
|---|---|
| Name | pipeline-architect |
| Description | Write TDDs and API specs from PRDs |
| Model | **claude-opus-4-6** |
| Frequency | Custom — same as PM: `0 13,15,17,19,21,23 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/architect.md` |

### Task 4: Pipeline Backend

| Field | Value |
|---|---|
| Name | pipeline-backend |
| Description | Backend implementation, review fixes, bug fixes |
| Model | claude-sonnet-4-6 |
| Frequency | Custom — same as PM: `0 13,15,17,19,21,23 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/backend.md` |

### Task 5: Pipeline Frontend

| Field | Value |
|---|---|
| Name | pipeline-frontend |
| Description | Frontend implementation, review fixes, bug fixes |
| Model | claude-sonnet-4-6 |
| Frequency | Custom — same as PM: `0 13,15,17,19,21,23 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/frontend.md` |

### Task 6: Pipeline Reviewer

| Field | Value |
|---|---|
| Name | pipeline-reviewer |
| Description | Code review, re-review after fixes, bug-fix re-review |
| Model | **claude-opus-4-6** |
| Frequency | Custom — same as PM: `0 13,15,17,19,21,23 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/reviewer.md` |

### Task 7: Pipeline QA

| Field | Value |
|---|---|
| Name | pipeline-qa |
| Description | Test plans and bug reports against PRD acceptance criteria |
| Model | claude-sonnet-4-6 |
| Frequency | Custom — same as PM: `0 13,15,17,19,21,23 * * *` |
| Working Folder | `/Users/wynclaw/projects/pipeline-orchestrator` |
| Permission Mode | Auto |
| Prompt | Contents of `prompts/qa.md` |

### DevOps (no scheduled task)

DevOps is manual-only. When the coordinator flags a project as ready for deploy, kick it manually:
```bash
./scripts/pipeline-kick.sh devops --project <project-name>
```

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

After creating all 7 tasks:

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
- **Updating prompts**: Edit the files in `prompts/` in this repo, then update the task prompt in the Desktop app (or edit `~/.claude/scheduled-tasks/<task-name>/SKILL.md` directly).
- **Pausing**: Toggle the repeat off on any task to pause it without deleting. Toggle back on to resume.

## Troubleshooting

**Agent does nothing when there's work available:**
- Check the session transcript for errors
- Verify the working folder is set to this repo (so CLAUDE.md is loaded)
- Verify `config.yaml` has the correct pipeline directory path
- Check that the pipeline directory exists and contains project subdirectories

**Telegram not sending:**
- Verify `TELEGRAM_BOT_TOKEN` is set in your shell environment
- Test manually: `./scripts/telegram-send.sh "test message"`

**Scripts fail with permission denied:**
- Run `chmod +x scripts/*.sh` from this repo directory

**Agent writes wrong file types:**
- The CLAUDE.md artifact ownership rules should prevent this. If it happens, add a rule to the agent's `rules/{agent}.md` file.
