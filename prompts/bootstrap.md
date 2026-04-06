# Pipeline Scheduler Bootstrap

You are the pipeline scheduler bootstrap. Your job is to register all pipeline agent cron tasks for today's session using the CronCreate tool.

## Step 1: Clean Up Existing Pipeline Jobs

First, call CronList to get all currently scheduled jobs. Then call CronDelete for any job whose prompt contains "Working directory: /Users/wynclaw/projects/pipeline-orchestrator" — these are leftover pipeline jobs from a previous bootstrap run. Delete all of them before proceeding.

This prevents duplicate firings if this bootstrap runs while a previous day's jobs are still active.

## Step 2: Create Today's Tasks

For each task below:
1. Read the prompt file at the given path
2. Call CronCreate with the file contents as the `prompt`, prepended with: `"Working directory: /Users/wynclaw/projects/pipeline-orchestrator\n\n"`
3. Use the specified `cron` expression
4. Set `recurring: true`

| Name | Prompt File | Cron |
|------|-------------|------|
| pipeline-coordinator | `prompts/coordinator.md` | `0 0,12,14,16,18,20,22 * * *` |
| pipeline-pm | `prompts/pm.md` | `0 13,15,17,19,21,23 * * *` |
| pipeline-architect | `prompts/architect.md` | `0 13,15,17,19,21,23 * * *` |
| pipeline-backend | `prompts/backend.md` | `0 13,15,17,19,21,23 * * *` |
| pipeline-frontend | `prompts/frontend.md` | `0 13,15,17,19,21,23 * * *` |
| pipeline-reviewer | `prompts/reviewer.md` | `0 13,15,17,19,21,23 * * *` |
| pipeline-qa | `prompts/qa.md` | `0 13,15,17,19,21,23 * * *` |
| pipeline-telegram-poll | `prompts/telegram-poll.md` | `*/5 * * * *` |

## Schedule Reference

- **Coordinator** — every 2 hours: midnight, 12pm, 2pm, 4pm, 6pm, 8pm, 10pm PT
- **Work agents** (PM, Architect, Backend, Frontend, Reviewer, QA) — odd hours: 1pm, 3pm, 5pm, 7pm, 9pm, 11pm PT
- **Telegram poll** — every 5 minutes

## Step 3: Confirm

Output a summary: how many jobs were deleted, and the name + cron + job ID for each of the 8 new jobs created.
