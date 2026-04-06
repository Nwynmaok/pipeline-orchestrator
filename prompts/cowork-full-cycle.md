# Pipeline Full Cycle — Cowork Task

Run a complete pipeline cycle across all projects. Check every agent's trigger conditions and execute any agent that has pending work, in the correct stage order.

## Pipeline Directory

Read `config.yaml` to get the pipeline directory path (the `pipeline.dir` value). All project artifacts live there.

## Rules & Conventions

Read `CLAUDE.md` in this repo for pipeline conventions, artifact ownership, phase rules, review cycle, and helper scripts.

## Execution Order

Process agents in pipeline stage order so downstream agents can pick up work produced by upstream agents in the same cycle:

1. **Coordinator** — scan all projects, update TRACKER.md and DASHBOARD.md
2. **PM** — write PRDs for any projects with intake notes but no PRD
3. **Architect** — write TDDs for any projects with PRDs but no TDD
4. **Backend** — implement backend for projects with TDDs, fix review feedback, fix bugs
5. **Frontend** — implement frontend for projects with TDDs, fix review feedback, fix bugs
6. **Reviewer** — review implementations, re-review after fixes, bug-fix re-reviews
7. **QA** — write test plans for approved reviews, file bugs

For each agent, read its full prompt from `prompts/{agent}.md` for trigger conditions and operating instructions.

## How to Run Each Agent

For each agent in order:

1. **Check trigger conditions** — scan the pipeline directory for the conditions described in the agent's prompt. List all projects that have work.
2. **Skip if no work** — if no trigger conditions are met, move to the next agent.
3. **Execute** — for each project with work, perform the agent's task:
   - Read the relevant artifacts
   - Do the work
   - Write output files directly to the project directory
   - Run `scripts/validate-artifact.sh` if applicable
   - Write `handoff-{slug}.md` for downstream context
   - Run `scripts/xp-log.sh` to log XP events
   - Run `scripts/run-log.sh` to log the run
4. **Move to next agent** — the next agent may now have work based on what was just produced

## Important Rules

- **Artifact ownership**: Each agent can only write its own file types (see CLAUDE.md). When acting as the PM, only write prd-*.md and stories-*.md. When acting as the reviewer, only write review-*.md. Etc.
- **Phase awareness**: Always read PHASE.md first. Use the correct artifact naming for the current phase.
- **Do not skip validation**: Run the validation script after writing PRDs, TDDs, reviews, and test plans.
- **Handoffs**: Write handoff-{slug}.md after each agent's work so the next agent has context.
- **Needs clarification**: If any agent encounters something it can't resolve, write needs-clarification.md and move to the next agent. Don't block the whole cycle.
- **DevOps is manual**: Never run the DevOps agent. If a project reaches deploy stage, just note it in the coordinator sync.

## After the Cycle

After all agents have run:

1. Run the coordinator one final time to update TRACKER.md and DASHBOARD.md with the new state
2. Send the Telegram sync via `scripts/telegram-send.sh`
3. Summarize what happened:
   - Which agents ran and on which projects
   - What artifacts were produced
   - What's now queued for the next cycle
   - Anything that needs Nathan's attention
