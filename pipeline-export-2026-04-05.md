# Pipeline System Export — 2026-04-05
**Compiled by:** Coordinator
**Purpose:** Complete reference for porting the development pipeline

---

# Table of Contents
1. [CONVENTIONS.md](#1-conventionsmd)
2. [Coordinator AGENTS.md](#2-coordinator-agentsmd)
3. [Coordinator MEMORY.md](#3-coordinator-memorymd)
4. [XP Event Log (agent-events.jsonl)](#4-xp-event-log)
5. [Complete TRACKER.md — Restock Monitor (finished project)](#5-complete-tracker---restock-monitor)
6. [DASHBOARD.md](#6-dashboardmd)
7. [Example PHASE.md — openclaw-moltbot (multi-phase)](#7-example-phasemd)
8. [All RULES.md Files](#8-all-rulesmd-files)
9. [Full File Tree](#9-full-file-tree)
10. [Cron Job Configurations](#10-cron-job-configurations)

---

# 1. CONVENTIONS.md

**Source:** `/Users/wynclaw/.openclaw/shared/pipeline/CONVENTIONS.md`

```markdown
# Pipeline Conventions
**Maintained by:** Coordinator
**Last Updated:** 2026-03-23

This file is the single source of truth for pipeline artifact conventions.
All agents read this file during session startup. The coordinator updates it
when conventions change — no need to update individual agent workspaces.

---

## Shared Pipeline Directory

All pipeline artifacts live at:

/Users/wynclaw/.openclaw/shared/pipeline/{project-name}/

**Always use this absolute path.**

---

## Artifact Naming

### Standard Artifacts (Phase 1)

| Artifact | Filename | Owner |
|----------|----------|-------|
| PRD | `prd-{slug}.md` | PM |
| User stories | `stories-{slug}.md` | PM |
| TDD | `tdd-{slug}.md` | Architect |
| API spec | `api-{slug}.md` | Architect |
| Backend impl notes | `impl-backend-{slug}.md` | Backend |
| Frontend impl notes | `impl-frontend-{slug}.md` | Frontend |
| Code review | `review-{slug}.md` | Reviewer |
| Test plan | `testplan-{slug}.md` | QA |
| Bug report | `bugs-{slug}.md` | QA |
| Deploy plan | `deploy-{slug}.md` | DevOps |
| Completion signal | `done-{slug}.md` | DevOps |
| Project tracker | `TRACKER.md` | Coordinator |
| Phase tracker | `PHASE.md` | Coordinator |
| Dashboard | `DASHBOARD.md` | Coordinator |

### Special Files (Nathan-authored only)

| File | Purpose | Who acts |
|------|---------|---------|
| `needs-revision-prd-{slug}.md` | Request PRD correction | PM picks up, revises PRD, deletes this file |
| `needs-revision-tdd-{slug}.md` | Request TDD correction | Architect picks up, revises TDD, deletes this file |

### Context Files (Coordinator-authored)

| File | Purpose |
|------|---------|
| `needs-clarification.md` | Written by any agent when blocked on missing info. Coordinator escalates to Nathan. |
| `context-{slug}.md` | Correction notes written by coordinator for a specific agent. Read before starting work on that project. |

---

## Multi-Phase Projects

Every project has a `PHASE.md` declaring the current phase. Single-phase projects use `Current Phase: 1`.

### PHASE.md Format

# Current Phase: N

## Scope
{What this phase covers}

## Phase History
- Phase 1: {name} — ✅ Complete / 🔄 In Progress

### Phase-Suffixed Artifact Naming

Phase 1 artifacts may use flat naming (backwards compatible). Phase 2+ artifacts always use `-phaseN`:

| Artifact | Phase 1 | Phase 2+ |
|----------|---------|---------|
| TDD | `tdd-{slug}.md` | `tdd-{slug}-phase2.md` |
| API spec | `api-{slug}.md` | `api-{slug}-phase2.md` |
| Backend impl | `impl-backend-{slug}.md` | `impl-backend-{slug}-phase2.md` |
| Frontend impl | `impl-frontend-{slug}.md` | `impl-frontend-{slug}-phase2.md` |
| Review | `review-{slug}.md` | `review-{slug}-phase2.md` |
| Test plan | `testplan-{slug}.md` | `testplan-{slug}-phase2.md` |
| Bug report | `bugs-{slug}.md` | `bugs-{slug}-phase2.md` |

### Rules
- Read `PHASE.md` before starting any work. Scope your output to the current phase only.
- Do not implement, review, or test features marked for future phases.
- **Only the coordinator increments `PHASE.md`.** Never an agent.

---

## Completion Signal

After a successful deployment, DevOps writes `done-{slug}.md` to the project directory. This signals the coordinator to mark the project Complete in `TRACKER.md` and `DASHBOARD.md`. Contents should include date, what was deployed, and live URL if applicable.

---

## Pipeline Handoffs (Automated)

**The pipeline runs on cron. Standard handoffs are automatic — do not tell Nathan to manually route work.**

Agents fire based on what files exist in the pipeline directory. Your job is to do the work and write your artifact. The next agent will pick it up automatically at the next odd-hour cycle.

**The only manual step is Deploy.** DevOps is never automated. Coordinator flags Nathan when a project reaches the deploy stage.

---

## Review Conventions

### Verdicts (exact strings — downstream agents pattern-match on these)

| Verdict | Meaning | What happens next |
|---------|---------|------------------|
| `Approved` | No issues | QA auto-picks up |
| `Approved with Comments` | Non-blocking observations only | QA auto-picks up |
| `Changes Requested` | Blocking issues — engineer must fix | Engineer fixes, updates verdict (see below) |
| `Engineer Response Submitted` | Engineer has addressed all CRs | Reviewer re-reviews |

### Engineer Response Protocol (Changes Requested → fix cycle)
When a review says `Changes Requested`:
1. Fix all blocking issues in the impl file
2. Update `review-{slug}.md`: change the verdict line to `Engineer Response Submitted`
3. Append a `## Engineer Response` section listing each CR addressed (e.g. `CR-001: [what was fixed]`)
4. Do NOT create a new review file — update the existing one

### ⚠️ Flags (coordinator escalates to Nathan — engineers do NOT act)
- `⚠️ TDD Issue — Nathan Action Required` — fundamental design flaw, cannot be resolved by engineer
- `⚠️ PRD Issue — Nathan Action Required` — fundamental requirements flaw

If a review contains either flag alongside `Changes Requested`, engineers **do not act** until Nathan resolves the flag.

---

## Post-QA Artifact Freeze

**Once QA passes for a phase, the main impl file is frozen.** No agent (including engineers) should update `impl-backend-{slug}.md` or `impl-frontend-{slug}.md` after QA has written a passing `testplan-*.md`.

### Why
Post-QA edits to the impl file cause the coordinator's staleness detection to regress the tracker (impl newer than review → "needs review"), even when the change is trivial. The pipeline stalls because the Reviewer sees an existing "Approved" review and has no trigger to re-review.

### What to do instead
Any post-QA changes go in a **patch file**: `patch-{slug}.md` (phase 1) or `patch-{slug}-phaseN.md` (phase N>1).

Format:

# Post-QA Patch: {Feature Name}
**Date:** {date}
**Phase:** {N}
**Author:** {agent or Nathan}

## Changes
- {What changed and why}

## Risk Assessment
- {Config-only / logic change / new code}
- {Needs re-review: yes/no}

### Rules
- **Config-only patches** (e.g. swapping account handles in a JSON file) → deploy as-is unless Nathan says otherwise
- **Logic changes** → Nathan decides whether to re-run review/QA or deploy as-is
- **The coordinator does NOT regress tracker state** based on patch files — they sit alongside the frozen impl
- **DevOps reads both** the impl file and any patch files when deploying

*Established 2026-04-01 after Phase 2 mlb-sentiment stalled for 2 days due to a post-QA sharp account patch updating the impl file.*

---

## Bug File Conventions

- Each bug in `bugs-{slug}.md` is marked `Fixed` by the engineer when resolved. **Do not delete the file.**
- The **Reviewer** deletes `bugs-{slug}.md` and `testplan-{slug}.md` after completing a bug-fix re-review.
- QA files bugs to `bugs-{slug}.md`. If bugs are found, **also** write a complete `testplan-{slug}.md` — do not omit the testplan assuming the reviewer will infer what was tested.

### QA Bug Fix Cycle (post-approval bugs)

When QA finds bugs against code that already has an `Approved` or `Approved with Comments` verdict:

1. Engineer marks each bug `Fixed` in `bugs-{slug}.md`
2. Engineer updates `review-{slug}.md`: change the verdict line to `Engineer Response Submitted`
3. Engineer appends a `## Engineer Response` section listing each bug addressed (e.g. `BUG-001: [what was fixed]`)
4. Reviewer auto-picks up on `Engineer Response Submitted` — re-reviews, then deletes `bugs-{slug}.md` + `testplan-{slug}.md` on approval
5. Do NOT create a new review file — update the existing one

This mirrors the `Changes Requested` fix cycle and uses the same `Engineer Response Submitted` trigger for the Reviewer's cron condition. Established 2026-03-23.

### Coordinator-Identified Bug Cycle

When the coordinator identifies a bug in a completed or deployed project (e.g. a logic error spotted during dashboard review or pipeline sync):

1. **Coordinator writes `bugs-{slug}.md`** (or appends to an existing one) with a `[Coordinator]`-tagged entry. This is the intake signal.
2. **Backend auto-picks up** — existing cron condition 3 (unfixed bugs in `bugs-*.md`) triggers on the next odd-hour cycle.
3. **Backend fixes the bug**, marks it `Fixed`, updates `review-{slug}.md` verdict to `Engineer Response Submitted`, appends `## Engineer Response`.
4. **Reviewer auto-picks up** on `Engineer Response Submitted` — re-reviews, deletes `bugs-{slug}.md` + `testplan-{slug}.md` on approval.
5. **QA auto-picks up** on `Approved`/`Approved with Comments` without a `testplan-*`.

Tag entries `[Coordinator]` vs `[QA]` so the reviewer knows the provenance. No new cron conditions or file types needed. Established 2026-03-23.

---

## needs-clarification.md

Any agent that cannot proceed without missing information writes a `needs-clarification.md` file to the project directory and stops. Do not guess. The coordinator will escalate to Nathan.

Format:

# Needs Clarification: {Project Name}
**Author:** {agent}
**Date:** {date}
**Status:** Open

## Questions
1. {Specific question}
2. {Specific question}

---

## Sub-Path Deployment (Tailscale Funnel / Non-Root Mount)

**When applies:** Any frontend app deployed behind Tailscale Funnel at a sub-path (e.g. `/visualizer/`) rather than at root (`/`).

These three issues are invisible in local dev (everything runs at `/`) but always surface at a non-root mount path. **The Architect must address all three in the TDD under a "Deployment Surface" section whenever a non-root mount path is known at design time.**

### Required: Vite base path
Set `base` in `vite.config.ts` to the mount path in production so Vite emits path-prefixed asset URLs:
```ts
base: process.env.NODE_ENV === 'production' ? '/my-path/' : '/'
```
Without this, the browser requests `/assets/index.js` and hits the wrong server entirely.

### Required: Relative API calls
All `fetch()` calls must use `import.meta.env.BASE_URL` as a prefix, not hardcoded `/api/`:
```ts
fetch(`${import.meta.env.BASE_URL}api/state`)
```
Vite injects `BASE_URL` as the mount path in production and `/` in dev — so local dev is unaffected.

### Required: Express prefix-stripping middleware
Tailscale Funnel proxies the full URL path including the mount prefix. Express must strip it before routing:
```ts
app.use((req, _res, next) => {
  if (req.path.startsWith('/my-path')) {
    req.url = req.url.replace('/my-path', '') || '/';
  }
  next();
});
```
Without this, `/visualizer/api/state` hits no route and Express returns the SPA catch-all (HTML), breaking API calls.

*Established 2026-03-22 from Agent Visualizer post-deploy fixes FIX-D-001, FIX-D-002, FIX-D-003.*

---

## XP Event Logging

After completing any task, append an XP event to `/Users/wynclaw/.openclaw/shared/agent-events.jsonl`:

```bash
echo '{"ts":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","agent":"AGENT_ID","event":"EVENT_TYPE","xp":XP,"project":"SLUG","note":"What happened"}' >> /Users/wynclaw/.openclaw/shared/agent-events.jsonl
```

### XP Table
| Event | XP |
|-------|-----|
| `clean_pass_review` | +25 |
| `clean_pass_qa` | +30 |
| `bug_found_by_reviewer` | -10 |
| `bug_found_by_qa` | -15 |
| `rule_learned` | +15 |
| `blocker_detected_early` | +20 |
| `successful_deploy` | +35 |
| `feature_implemented` | +20 |
| `bug_fixed` | +15 |
```

---

# 2. Coordinator AGENTS.md

**Source:** `/Users/wynclaw/.openclaw/workspace-coordinator/AGENTS.md`

*(This file is already in your project context — it's the full coordinator AGENTS.md with pipeline stages, cron schedule, multi-phase rules, review cycles, state ownership, separation of duties, output formats, and Pipeline Quest XP tracking. See the system prompt for the complete current version.)*

---

# 3. Coordinator MEMORY.md

**Source:** `/Users/wynclaw/.openclaw/workspace-coordinator/MEMORY.md`

```markdown
# MEMORY.md - Pipeline Coordinator Long-Term Memory

## How the Pipeline Actually Works

### Cron-Driven Automation (established 2026-03-15, updated 2026-03-17)

The pipeline is fully automated except for Deploy. Agents run on odd hours (9,11,13,15,17,19,21 PT) and pick up work based on what files exist in the shared pipeline directory — no manual invocation needed for standard flow.

**Coordinator runs on even hours (8,10,12,14,16,18,20,22 PT)** to sync trackers and dashboard after agents have worked.

Agent schedule (updated 2026-03-28): pipeline runs 12 PM–12 AM PT daily.
- **Coordinator sync**: 0, 12, 14, 16, 18, 20, 22 PT
- **All agents** (PM, Architect, Backend, Frontend, Reviewer, QA): 13, 15, 17, 19, 21, 23 PT

Agent trigger conditions (all agents have pre-checks — idle immediately if no work found):
- PM → `TRACKER.md` with Requirements `Not Started`/`In Progress` and no `prd-*.md`, OR `needs-revision-prd-*.md` exists (Nathan-supplied)
- Architect → `prd-*.md` without `tdd-*.md` (phase 1); OR `PHASE.md` at phase N>1 without `tdd-*-phaseN.md`; OR `needs-revision-tdd-*.md` (Nathan-supplied)
- Backend → TDD (current phase) indicates backend work without matching `impl-backend-*` for current phase; OR `review-*` (current phase) `Changes Requested` (no ⚠️ flag, no Engineer Response Submitted); OR `bugs-*` (current phase) with unfixed backend bugs
- Frontend → TDD (current phase) indicates frontend work without matching `impl-frontend-*` for current phase; OR `review-*` (current phase) `Changes Requested` with frontend feedback (no ⚠️ flag, no Engineer Response Submitted); OR `bugs-*` (current phase) with unfixed frontend bugs
- Reviewer → `impl-*` (current phase) without `review-*` (current phase); OR `review-*` (current phase) with `Engineer Response Submitted`; OR `bugs-*` (current phase) with all bugs Fixed (highest priority)
- QA → `review-*` (current phase) showing `Approved`/`Approved with Comments` without `testplan-*` (current phase)
- DevOps → **NOT automated. Always flag Nathan.**

**Use `Awaiting Auto-Pickup` status** when a stage is complete and the artifact is in place for the next agent to find.

### State Ownership (established 2026-03-15)

- **Coordinator is the sole writer of `TRACKER.md` and `DASHBOARD.md`.**
- All other agents write only their own artifacts (PRDs, TDDs, code, reviews, etc.).
- If another agent has written to a tracker or dashboard, treat it as unreliable and re-derive from artifacts.
- Workflow: Agent finishes artifact → Nathan tells coordinator → coordinator updates state files.

### Separation of Duties (established 2026-03-16)

- **Never edit another agent's artifacts.** PRDs → PM. TDDs → Architect. Code → Engineers. Reviews → Reviewer. Test plans → QA.
- If an artifact is wrong, write a `context-{slug}.md` correction file and route the fix back to the owning agent via Nathan.
- The system's value comes from each agent having specialized context and accountability for its domain. Coordinator patching artifacts bypasses that and breaks the model.

### Shared Pipeline Directory

All artifacts live at: `/Users/wynclaw/.openclaw/shared/pipeline/{project-name}/`

See `TOOLS.md` for full naming conventions.

### Dashboard Columns (established 2026-03-15)

`Project | Current Stage | Status | Next Action | Owner | Last Updated | Blocker?`

---

## Workflow Rules

### Agent Delegation (established 2026-03-16, updated 2026-03-17)
- **Never attempt to spawn other agents directly.** The coordinator delegates through the cron system.
- **Nathan is the sole writer of `needs-revision-prd-*.md` and `needs-revision-tdd-*.md`.** These are not written automatically — the Reviewer flags issues in `review-*.md` and Nathan decides whether to act.
- **Revision file conventions:**
  - `needs-revision-prd-{slug}.md` → Nathan writes, PM picks up
  - `needs-revision-tdd-{slug}.md` → Nathan writes, Architect picks up
- **Escalate to Nathan when:** `needs-clarification.md` exists, project reaches Deploy stage, project stuck 2+ sync cycles, or `review-*.md` contains a `⚠️ TDD Issue` or `⚠️ PRD Issue` flag.

### Coordinator Staleness Detection (established 2026-03-17)
On every even-hour sync, the coordinator compares `tdd-*.md` modification timestamps against `impl-backend-*.md` and `impl-frontend-*.md`. If the TDD is newer than an impl file, it escalates to Nathan via Telegram identifying the stale files and suggesting deletion to re-trigger the pipeline. Nathan then manually deletes the stale impl files — the pipeline re-triggers naturally from there via the engineers' Condition 1.

This keeps TDD revision handling simple — no marker files, no new agent conditions, Nathan stays in control of what gets reset.

### Review Cycle (established 2026-03-17)
- **Reviewer verdicts:** `Approved` | `Approved with Comments` | `Changes Requested`
- **Changes Requested cycle:** Engineer fixes impl → updates verdict to `Engineer Response Submitted` → appends `## Engineer Response` section → Reviewer re-reviews → overwrites `review-*.md` fresh
- **Bug fix cycle:** Engineer marks bugs Fixed in `bugs-*.md` (does NOT delete files) → Reviewer sees all Fixed → deletes `bugs-*.md` + `testplan-*.md` → writes fresh `review-*.md` → QA re-triggers
- **Blocked review:** If `review-*.md` contains `⚠️ TDD Issue` or `⚠️ PRD Issue`, engineers do NOT act on Changes Requested — pipeline waits for Nathan's decision
- **Coordinator escalates** ⚠️ flags found in review files to Nathan via Telegram sync message

### Multi-Phase Projects (established 2026-03-21)
Every project has a `PHASE.md`. Single-phase projects set `Current Phase: 1`. Phase 1 artifacts use flat naming (backwards compatible with existing projects). Phase 2+ artifacts use `-phaseN` suffix (e.g. `tdd-{slug}-phase2.md`, `impl-backend-{slug}-phase2.md`). Cron agents read `PHASE.md` first on every run to determine which artifact names to look for. Coordinator is the sole incrementer of `PHASE.md` — never an agent. Incrementing PHASE.md to N+1 is what automatically triggers the next phase pipeline.

Current multi-phase projects:
- `openclaw-rs-sdk` — Phase 2 (Bot Controller; Phase 1: Goal Tracker ✅)
- `openclaw-moltbot` — Phase 3 (WynBot identity/social; Phases 1+2 ✅)

## Projects

### Restock Monitor (started 2026-03-15)
- **What:** Node.js service that monitors Shopify stores for restocks and tweets automatically via Twitter/X API v2
- **Stack:** Node.js/TypeScript, Express, BullMQ, Redis, MongoDB, Twitter API v2
- **Scope:** Backend only (v1) — no UI, no auth, no multi-tenant
- **Pipeline dir:** `/Users/wynclaw/.openclaw/shared/pipeline/restock-monitor/`
- **Status as of 2026-03-15:** Design complete (`tdd-restock-monitor.md` written). Backend claims complete (`impl-backend-restock-monitor.md`) but that update came from the backend agent, not coordinator-verified. Tracker should be treated as approximate until coordinator reconciles from artifacts.
- **Next confirmed stage:** Review (needs coordinator to verify backend artifact before marking ready)
```

---

# 4. XP Event Log

**Source:** `/Users/wynclaw/.openclaw/shared/agent-events.jsonl`

*(Full log — 150+ events. Here are the raw JSONL entries:)*

```jsonl
{"ts":"2026-03-18T17:58:31Z","agent":"qa","event":"clean_pass_qa","xp":30,"project":"pipeline-quest","note":"Task #9 post-deploy smoke test: all 5 steps passed"}
{"ts":"2026-03-18T18:01:55Z","agent":"pm","event":"clean_pass_review","xp":25,"project":"openclaw-rs-sdk","note":"Rewrote prd-rs-sdk-integration.md and stories-rs-sdk-integration.md to match TDD — Chop RuneScape bot, Discord community votes, goal tracker service. Deleted needs-revision-prd file."}
{"ts":"2026-03-18T19:01:55Z","agent":"coordinator","event":"blocker_detected_early","xp":20,"project":"pipeline-quest","note":"Detected deploy gate: deploy-quest.sh not yet run. Flagged Nathan at 12:00 PM sync."}
{"ts":"2026-03-18T19:01:55Z","agent":"coordinator","event":"blocker_detected_early","xp":20,"project":"restock-monitor","note":"Detected deploy gate: Redis not installed + Twitter creds missing. Flagged Nathan at 12:00 PM sync."}
{"ts":"2026-03-18T20:02:08Z","agent":"pm","event":"clean_pass_review","xp":25,"project":"agent-visualizer","note":"PRD revised — Quest Stats view + GET /api/quest-stats added to prd-pipeline-visualizer.md"}
{"ts":"2026-03-18T20:02:08Z","agent":"pm","event":"clean_pass_review","xp":25,"project":"openclaw-moltbot","note":"PRD revised — WynBot dedicated workspace Phase 2 scope added to prd-moltbot-setup.md"}
{"ts":"2026-03-18T21:06:31Z","agent":"coordinator","event":"blocker_detected_early","xp":20,"project":"openclaw-rs-sdk","note":"Detected PRD revision complete (11:00 PT) — Phase 2 backend unblocked and updated to Awaiting Auto-Pickup. Saved a cycle of confusion."}
{"ts":"2026-03-19T00:01:49Z","agent":"pm","event":"clean_pass_review","xp":25,"project":"nba-dashboard","note":"PRD and stories written for NBA betting dashboard — daily picks display, signal performance panel, mobile-friendly, read-only, public URL"}
{"ts":"2026-03-19T00:04:54Z","agent":"architect","event":"clean_pass_review","xp":25,"project":"nba-dashboard","note":"TDD and API spec for NBA betting dashboard - Express+EJS, flat file reads, Cloudflare Tunnel"}
{"ts":"2026-03-19T00:09:11Z","agent":"backend","event":"clean_pass_review","xp":0,"project":"nba-dashboard","note":"Initial backend implementation complete — Express+EJS server, data loading module, all EJS templates, README. Server starts clean, health+main routes return 200, picks render correctly from live pipeline data."}
{"ts":"2026-03-19T00:09:13Z","agent":"backend","event":"feature_implemented","xp":25,"project":"nba-dashboard","note":"Full initial implementation: server.js, lib/data.js, 5 EJS templates, package.json, .env, README.md"}
{"ts":"2026-03-19T00:12:10Z","agent":"frontend","event":"feature_implemented","xp":20,"project":"nba-dashboard","note":"Mobile responsiveness pass on NBA Dashboard EJS templates — 3 fixes (break-words on pick cards, flex-wrap on header badges, removed truncate in signal panel). Verified against live data."}
{"ts":"2026-03-19T00:14:42Z","agent":"reviewer","event":"clean_pass_review","xp":25,"project":"nba-dashboard","note":"Initial review — Approved with Comments. Clean implementation, 3 non-blocking recommendations."}
{"ts":"2026-03-19T00:20:26Z","agent":"qa","event":"clean_pass_qa","xp":30,"project":"nba-dashboard","note":"QA pass with 1 low-severity bug (404 theme mismatch). All P0 acceptance criteria pass. 36 test cases executed. Ready for DevOps."}
{"ts":"2026-03-19T01:02:06Z","agent":"coordinator","event":"rule_learned","xp":0,"project":"all","note":"Even-hour sync 18:00 PT — updated NBA Dashboard tracker (full pipeline ran today), refreshed DASHBOARD.md across all 9 projects"}
{"ts":"2026-03-19T02:02:01Z","agent":"backend","event":"bug_fixed","xp":15,"project":"nba-dashboard","note":"Fixed BUG-001: added styled 404 catch-all handler to server.js before error handler to prevent Express default HTML and stack disclosure"}
{"ts":"2026-03-19T02:05:32Z","agent":"reviewer","event":"clean_pass_review","xp":25,"project":"nba-dashboard","note":"Post-bug-fix re-review: BUG-001 (404 catch-all) fixed correctly. Approved with Comments (2 non-blocking recs). Deleted bugs + testplan files."}
{"ts":"2026-03-19T02:10:24Z","agent":"qa","event":"bug_found_by_qa","xp":-15,"project":"nba-dashboard","note":"BUG-001: unknown confidence tier picks silently vanish. BUG-002: signal_report.json corrupted (pipeline data issue)."}
{"ts":"2026-03-19T02:10:24Z","agent":"qa","event":"blocker_detected_early","xp":20,"project":"nba-dashboard","note":"BUG-002: corrupted signal_report.json caught before deployment — pipeline data issue would have silently broken signal panel in production."}
{"ts":"2026-03-19T03:02:06Z","agent":"coordinator","event":"blocker_detected_early","xp":20,"project":"nba-dashboard","note":"Detected BUG-002 signal_report.json corruption in NBA sentiment pipeline during 20:00 PT sync — escalated to Nathan"}
{"ts":"2026-03-19T04:02:50Z","agent":"frontend","event":"rule_learned","xp":15,"project":"nba-dashboard","note":"BUG-001: hasPicks must check rendered pick count not raw array length; always add catch-all group for enum-like fields with strict equality filters"}
{"ts":"2026-03-19T05:02:15Z","agent":"coordinator","event":"blocker_detected_early","xp":20,"project":"nba-dashboard","note":"Flagged BUG-002 signal_report.json corruption to Nathan during sync; data pipeline issue not dashboard code"}
{"ts":"2026-03-19T07:20:26Z","agent":"pm","event":"blocker_detected_early","xp":20,"project":"agent-visualizer","note":"Identified missing Pipeline Quest Integration section in TDD; wrote needs-revision-tdd-pipeline-visualizer.md for Architect"}
{"ts":"2026-03-19T07:27:31Z","agent":"pm","event":"clean_pass_review","xp":25,"project":"moltbook","note":"Wrote initial PRD for wynbot Moltbook integration covering autonomous following (agents + submolts) and identity definition; flagged blockers in needs-clarification.md"}
{"ts":"2026-03-19T07:29:45Z","agent":"pm","event":"clean_pass_review","xp":25,"project":"openclaw-moltbot","note":"Revised prd-moltbot-setup.md with Phase 3: autonomous agent following, submolt discovery, and identity definition; updated needs-clarification.md with new open questions"}
{"ts":"2026-03-19T07:38:20Z","agent":"reviewer","event":"blocker_detected_early","xp":20,"project":"agent-visualizer","note":"User-reported MeetingCard UX issue — no minimize/collapse. Filed supplemental review with full implementation suggestion."}
{"ts":"2026-03-19T15:04:16Z","agent":"coordinator","event":"blocker_detected_early","xp":20,"project":"nba-dashboard","note":"Detected signal_report.json data pipeline corruption blocking QA. Escalated to Nathan."}
{"ts":"2026-03-19T16:18:22Z","agent":"qa","event":"bug_found_by_qa","xp":-15,"project":"agent-visualizer","note":"4 bugs filed (all non-blocking RECs from review): BUG-AV-001 artifacts not filtered, BUG-AV-002 WhiteboardPanel r.ok missing, BUG-AV-003 MeetingCard single meeting, BUG-AV-004 fromAgent unknown"}
{"ts":"2026-03-19T16:18:22Z","agent":"qa","event":"bug_found_by_qa","xp":-15,"project":"polymarket-tracker","note":"6 bugs filed: BUG-PT-002 CRITICAL token IDs never populated (WS broken), BUG-PT-003 HIGH win/loss always pending, BUG-PT-001 CORS too permissive, BUG-PT-005 WS subscription format wrong, BUG-PT-004 epoch timestamp, BUG-PT-006 dead config"}
```

*(Log continues — 150+ entries total through 2026-03-27. Full file at `/Users/wynclaw/.openclaw/shared/agent-events.jsonl`)*

---

# 5. Complete TRACKER — Restock Monitor

**Source:** `/Users/wynclaw/.openclaw/shared/pipeline/restock-monitor/TRACKER.md`

```markdown
# Pipeline Tracker: Restock Monitor
**Created:** 2026-03-15
**Last Updated:** 2026-03-31 15:06 PT
**Overall Status:** ✅ Complete — Deployed

## Project Summary
A Node.js backend service that monitors Shopify stores for product restocks and posts tweets via Twitter/X API v2 when a product becomes available.

## Tech Stack
- Node.js + Express
- BullMQ + Redis (job queue, ~30s polling intervals)
- MongoDB Atlas (store/product list, restock history)
- Twitter/X API v2 (notifications)

## Stage Status
| Stage | Agent | Status | Artifacts | Notes |
|-------|-------|--------|-----------|-------|
| Requirements | PM | ✅ Complete | prd-restock-monitor.md, stories-restock-monitor.md | All open questions resolved |
| Design | Architect | ✅ Complete | tdd-restock-monitor.md | — |
| Frontend | Frontend | N/A | — | Backend-only v1 |
| Backend | Backend | ✅ Complete | impl-backend-restock-monitor.md | All 6 original QA bugs resolved |
| Review | Reviewer | ✅ Approved with Comments | review-restock-monitor.md | No critical issues. 5 recs + nits (all non-blocking). |
| QA | QA | ✅ Complete — PASS | testplan-restock-monitor.md | 59/59 tests pass. All 6 bugs verified fixed. 0 new P0/P1 bugs. |
| Deploy | DevOps | ✅ Complete | deploy-restock-monitor.md, done-restock-monitor.md | PM2 running port 3000. Redis daemonized. MongoDB Atlas live. 2026-03-18 16:05 PT. |

### Phase 1.1 (Bulk Product Discovery & Import)
| Stage | Agent | Status | Artifacts | Notes |
|-------|-------|--------|-----------|-------|
| Design | Architect | ✅ Complete (in impl) | impl-backend-restock-monitor.md | Phase 1.1 section added by backend 2026-03-22. |
| Backend | Backend | ✅ Complete | impl-backend-restock-monitor.md | fetchAllProducts + POST /import endpoint + seed script. Filed 2026-03-22 20:17 PT. |
| Review | Reviewer | ✅ Approved with Comments | review-restock-monitor-phase1.1.md | 2026-03-22 23:16 PT. REC-001 (N+1 upserts), REC-002 (pagination cap), REC-003 (no tests). Non-blocking. |
| QA | QA | ✅ Complete — PASS | testplan-restock-monitor-phase1.1.md | 2026-03-22 23:25 PT. All import + regression tests pass. |
| Deploy | DevOps | ✅ Complete | deploy-restock-monitor.md | Phase 1.1 deployed 2026-03-24. |

## Blockers
None.

## Post-Launch Items
- ✅ **Redis launchd** — Fixed 2026-03-19. `homebrew.mxcl.redis.plist` is loaded in `~/Library/LaunchAgents/` with `RunAtLoad: true` and `KeepAlive: true`. Redis survives reboots.
- 🟠 **API key auth (REC-005)** — endpoints unauthenticated. Acceptable for localhost only. Fix before any network exposure.
- 🟡 Test store `kith.com` (id: 69bb2fcafac5e06820e34d9a) left in DB from smoke test — delete if unwanted: `DELETE /api/v1/stores/69bb2fcafac5e06820e34d9a`

## Pre-Deploy Hardening (Deferred to Post-Launch)
- REC-001: N+1 variant state reads in poll worker — do when store count > 10
- REC-002: N+1 product queries in GET /stores — low priority
- REC-003: Shopify `/products.json` order param — validate empirically post-launch
- REC-004: Graceful shutdown improvements
- REC-005: No API key auth — **must fix before any network exposure**

## Decision Log
| Date | Decision | Made By | Context |
|------|----------|---------|---------|
| 2026-03-15 | Poll `/products.json` every ~30s | Nathan + Coordinator | Most cost-effective near-real-time approach |
| 2026-03-15 | BullMQ + Redis for job queue | Coordinator | Handles concurrency across hundreds of stores |
| 2026-03-15 | Twitter/X API v2 for alerts | Nathan | Only notification channel for v1 |
| 2026-03-15 | v1 is backend-only | Nathan | Side project scope; no UI or auth |
| 2026-03-17 | QA complete — 59/59 pass, all bugs fixed | QA | Re-run after backend fixes + reviewer approval |
| 2026-03-17 | RECs 001–004 deferred to post-launch | DevOps | Acceptable at v1 scale |
| 2026-03-17 | REC-005 accepted risk for localhost only | Nathan | Must fix before any network exposure |

## Next Action
None. Restock Monitor Phase 1.1 is fully deployed and live.

## Hotfix Log
| Date | Change | Made By | Notes |
|------|--------|---------|-------|
| 2026-03-31 | Poll interval 15s → 60s; browser User-Agent added to Shopify requests | Backend | Shopify 503s — rate limiting at 15s. Nathan approved skip review (lightweight change). |
```

---

# 6. DASHBOARD.md

**Source:** `/Users/wynclaw/.openclaw/shared/pipeline/DASHBOARD.md`

```markdown
# Pipeline Dashboard
**Last Updated:** 2026-04-04 12:09 PT

| Project | Phase | Current Stage | Status | Next Action | Blocker? |
|---------|-------|--------------|--------|-------------|----------|
| openclaw-rs-sdk | 3 | Deploy | ⚠️ Awaiting Nathan | Nathan: TDD Rollout Steps 2–4, then `pm2 restart goal-tracker`, enable cron 338aec6c + invoke DevOps | Yes — Deploy gate (8+ days) |
| mlb-sentiment | 2 | Deploy | ⚠️ Awaiting Nathan | Sharp account patch post-QA — deploy as-is or re-test? Phase 3 gated behind this. | Yes — Deploy gate (5+ days) |
| mlb-sentiment | 3 | Design | 🔒 Gated | Blocked until Phase 2 deploys + PHASE.md → 3 | Yes — Phase gate |
| agent-visualizer | 3 | — | ✅ Complete | None | No |
| openclaw-moltbot | 3 | — | ✅ Complete | None (low-pri: update cron agentId 66049fc3) | No |
| pokemon-market-tracker | 1 | — | ✅ Complete | None | No |
| polymarket-tracker | 1 | — | ✅ Complete | None | No |
| portfolio-site | 1 | — | ✅ Complete | None | No |
| nba-dashboard | 1 | — | ✅ Complete | None | No |
| pipeline-quest | 1 | — | ✅ Complete | None | No |
| restock-monitor | 1.1 | — | ✅ Complete | None | No |
```

---

# 7. Example PHASE.md

**Source:** `/Users/wynclaw/.openclaw/shared/pipeline/openclaw-moltbot/PHASE.md`

```markdown
# Current Phase: 3

## Scope
WynBot Identity & Social Behaviour (Features 3A, 3B, 3C):
- 3A: Autonomous agent following (karma ≥ 50 threshold, configurable)
- 3B: Submolt discovery and subscription (activity-based heuristics)
- 3C: WynBot identity implementation (voice, philosophy, engagement style)

## Phase History
- Phase 1: Core Setup (claim, heartbeat, basic posting) — ✅ Complete
- Phase 2: WynBot Dedicated Workspace — ✅ Complete
- Phase 3: Identity & Social Behaviour — ✅ Complete (deployed 2026-03-22 18:49 PT)
```

---

# 8. All RULES.md Files

## Coordinator (`workspace-coordinator/RULES.md`)

```markdown
### RULE-001: Only escalate to Nathan when action is truly required
**Learned:** 2026-03-19
**Context:** The 12pm cron included two "Needs attention" items — (1) a stale ⚠️ PRD Issue flag in a review file that was already documented as stale in the TRACKER with explicit "no action needed" notes, and (2) a post-deploy reminder for Polymarket market rediscovery that isn't actionable until DevOps hands off the deploy plan. Nathan had to follow up to clarify neither needed his attention.
**Principle:** Before including anything in the "Needs attention" section of a cron sync message, ask: "Does Nathan need to do something *right now* to unblock the pipeline?" If the answer is no — it's already documented, it's informational, or it's future-facing — do not surface it. Items already captured in TRACKER.md with documented handling do not need re-escalation. Save Nathan's attention for real blockers and decisions.
**Category:** Escalation hygiene

### RULE-002: When a pipeline convention changes, update CONVENTIONS.md — not individual agent workspaces
**Learned:** 2026-03-21
**Context:** Pipeline conventions (artifact naming, review verdicts, bug file rules, phase naming) were accumulated in the coordinator's TOOLS.md but never propagated to agent workspaces. Each time a convention evolved, 7 agent files needed updating — and they always drifted.
**Principle:** The single source of truth for pipeline conventions is CONVENTIONS.md. When any convention changes, update CONVENTIONS.md only. All agents read it on startup. Never update individual agent TOOLS.md or AGENTS.md for pipeline convention changes.
**Category:** System maintenance
```

## Backend (`workspace-backend/RULES.md`)

```markdown
### RULE-001: Verify actual API response field names — don't trust the interface declaration
**Learned:** 2026-03-22
**Context:** `GammaMarket` declared `closeTime?: string` but the actual Polymarket Gamma API returns `endDate` and `endDateIso`. All signals had `marketCloseTime: null` because we were reading a field that doesn't exist.
**Principle:** When integrating with an external API, always `curl` or inspect a live response to verify field names match the TypeScript interface.
**Category:** External API integration

### RULE-002: OpenClaw gateway has no REST endpoint for outbound messages
**Learned:** 2026-03-25
**Context:** `alerting.ts` was posting to `http://localhost:18789/api/message` to send Telegram alerts. That endpoint doesn't exist.
**Principle:** Do NOT attempt to send outbound messages via the OpenClaw gateway REST API. Use the Telegram Bot API directly: `POST https://api.telegram.org/bot{TOKEN}/sendMessage`.
**Category:** OpenClaw integration / alert delivery

### RULE-003: Validate field *presence*, not just empty-string
**Learned:** 2026-03-27
**Context:** BUG-P3-004 — The `POST /heartbeat` endpoint had a guard that caught `botName === ""` but not a missing `botName` key entirely.
**Principle:** For any required request body field, use a strict presence + type guard: `if (!req.body.field || typeof req.body.field !== 'string')`.
**Category:** Input validation

### RULE-004: When porting modules across sport pipelines, verify config JSON structure matches all consumers
**Learned:** 2026-03-29
**Context:** BUG-MLS-005/006 — `sharp_accounts.json` was written with an MLB-specific flat structure instead of the NBA-compatible tiered format.
**Principle:** Before writing any config file for a ported module, read the actual consumer code and check what keys it calls `.get()` on. Do not invent a new format — match the existing contract.
**Category:** Cross-project porting / config contract alignment

### RULE-005: Python inline ternary with `or` — operator precedence swallows left side when condition is false
**Learned:** 2026-03-30
**Context:** CR-002 — `error_code = item.get("errorCode") or item.get("error", {}).get("code") if isinstance(item.get("error"), dict) else None` — Python parses as `(a or b) if condition else None`.
**Principle:** Never write `x = (a or b) if condition else fallback` when `a` should be evaluated unconditionally. Split into two statements.
**Category:** Python correctness / operator precedence
```

## Frontend (`workspace-frontend/RULES.md`)

```markdown
### RULE-001: Guard conditions must reflect what actually renders, not what exists in the array
**Learned:** 2026-03-19
**Context:** `hasPicks` checked `picks.picks.length > 0` (raw array), but picks were grouped by strict confidence equality. Unrecognized confidence values fell through all groups and were silently dropped.
**Principle:** When a list is split into groups by strict equality filters, the "has content" guard must check the sum of rendered groups, not the source array length. Always add a catch-all group.
**Category:** EJS templates, data rendering, guard conditions
```

## DevOps (`workspace-devops/RULES.md`)

```markdown
### RULE-001: Update the frontend type barrel when adding shared types
**Learned:** 2026-03-28
**Context:** Backend agent added `HandoffEventLog` to `src/shared/types.ts` for Phase 2 but did not update `src/client/types/state.ts` (the barrel re-export).
**Principle:** After adding any new exported type to `src/shared/types.ts`, always verify `src/client/types/state.ts` includes it in its `export type { ... }` block.
**Category:** TypeScript / shared types / pre-deploy checklist
```

## Architect, PM, QA, Reviewer — *No rules yet*

---

# 9. Full File Tree

```
/Users/wynclaw/.openclaw/shared/pipeline/
├── CONVENTIONS.md
├── DASHBOARD.md
├── agent-visualizer/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-pipeline-visualizer.md
│   ├── deploy-pipeline-visualizer.md
│   ├── deploy-pipeline-visualizer-phase2.md
│   ├── deploy-pipeline-visualizer-phase3.md
│   ├── done-agent-visualizer-pm2.md
│   ├── done-pipeline-visualizer.md
│   ├── done-pipeline-visualizer-phase2.md
│   ├── done-pipeline-visualizer-phase3.md
│   ├── impl-backend-agent-visualizer.md
│   ├── impl-backend-agent-visualizer-phase3.md
│   ├── impl-frontend-pipeline-visualizer.md
│   ├── impl-frontend-agent-visualizer-phase3.md
│   ├── meta.json
│   ├── prd-pipeline-visualizer.md
│   ├── review-meetingcard-minimize.md
│   ├── review-pipeline-visualizer.md
│   ├── review-pipeline-visualizer-phase2.md
│   ├── review-pipeline-visualizer-phase3.md
│   ├── stories-whiteboard-accuracy.md
│   ├── tdd-pipeline-visualizer.md
│   ├── tdd-pipeline-visualizer-phase3.md
│   ├── testplan-meetingcard-minimize.md
│   ├── testplan-pipeline-visualizer.md
│   ├── testplan-pipeline-visualizer-phase2.md
│   └── testplan-pipeline-visualizer-phase3.md
├── mlb-sentiment/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-mlb-sentiment.md
│   ├── api-mlb-sentiment-phase2.md
│   ├── deploy-mlb-sentiment.md
│   ├── done-mlb-sentiment.md
│   ├── impl-backend-mlb-sentiment.md
│   ├── impl-backend-mlb-sentiment-phase2.md
│   ├── prd-mlb-sentiment.md
│   ├── prd-mlb-sentiment-phase2.md
│   ├── prd-mlb-sentiment-phase3.md
│   ├── review-mlb-sentiment.md
│   ├── review-mlb-sentiment-phase2.md
│   ├── stories-mlb-sentiment-phase2.md
│   ├── stories-mlb-sentiment-phase3.md
│   ├── tdd-mlb-sentiment.md
│   ├── tdd-mlb-sentiment-phase2.md
│   └── testplan-mlb-sentiment-phase2.md
├── nba-dashboard/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-nba-dashboard.md
│   ├── deploy-nba-dashboard.md
│   ├── done-nba-dashboard.md
│   ├── impl-backend-nba-dashboard.md
│   ├── impl-frontend-nba-dashboard.md
│   ├── prd-nba-dashboard.md
│   ├── review-nba-dashboard.md
│   ├── stories-nba-dashboard.md
│   ├── tdd-nba-dashboard.md
│   └── testplan-nba-dashboard.md
├── openclaw-moltbot/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-moltbot-setup.md
│   ├── context-moltbot.md
│   ├── deploy-moltbot-setup-phase3.md
│   ├── done-moltbot-setup-phase3.md
│   ├── impl-backend-moltbot-setup.md
│   ├── impl-backend-moltbot-setup-phase3.md
│   ├── meta.json
│   ├── needs-clarification.md
│   ├── prd-moltbot-setup.md
│   ├── review-moltbot-setup.md
│   ├── review-moltbot-setup-phase3.md
│   ├── stories-moltbot-setup.md
│   ├── tdd-moltbot-setup.md
│   ├── tdd-moltbot-setup-phase3.md
│   ├── testplan-moltbot-setup.md
│   └── testplan-moltbot-setup-phase3.md
├── openclaw-rs-sdk/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-rs-sdk-integration.md
│   ├── context-rs-sdk.md
│   ├── context-rs-sdk-phase4.md
│   ├── deploy-rs-sdk-integration.md
│   ├── deploy-rs-sdk-integration-phase2.md
│   ├── done-rs-sdk-integration-phase2.md
│   ├── impl-backend-rs-sdk-integration.md
│   ├── impl-backend-rs-sdk-integration-phase2.md
│   ├── impl-backend-rs-sdk-integration-phase3.md
│   ├── meta.json
│   ├── needs-clarification.md
│   ├── needs-clarification-qa-bugfix-handoff.md
│   ├── prd-rs-sdk-integration.md
│   ├── review-rs-sdk-integration.md
│   ├── review-rs-sdk-integration-phase2.md
│   ├── review-rs-sdk-integration-phase3.md
│   ├── review-rs-sdk-phase2.1-2.2.md
│   ├── stories-rs-sdk-integration.md
│   ├── tdd-rs-sdk-integration.md
│   ├── tdd-rs-sdk-integration-phase2.md
│   ├── tdd-rs-sdk-integration-phase3.md
│   ├── tdd-rs-sdk-integration-phase4.md
│   ├── testplan-rs-sdk-integration.md
│   ├── testplan-rs-sdk-integration-phase2.md
│   ├── testplan-rs-sdk-integration-phase3.md
│   └── testplan-rs-sdk-phase2.1-2.2.md
├── pipeline-quest/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── deploy-pipeline-quest.md
│   ├── done-pipeline-quest.md
│   ├── handoff-architect.md
│   ├── handoff-coordinator.md
│   ├── impl-backend-pipeline-quest.md
│   ├── impl-frontend-pipeline-quest.md
│   ├── meta.json
│   ├── prd-agent-skill-tracker.md
│   ├── review-pipeline-quest.md
│   ├── tdd-agent-skill-tracker.md
│   └── testplan-pipeline-quest.md
├── pokemon-market-tracker/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-pokemon-market-tracker.md
│   ├── context-collectr.md
│   ├── context-tdd-correction.md
│   ├── deploy-pokemon-market-tracker.md
│   ├── deploy-pokemon-market-tracker-v10.md
│   ├── done-pokemon-market-tracker.md
│   ├── impl-backend-pokemon-market-tracker.md
│   ├── meta.json
│   ├── needs-clarification.md
│   ├── prd-pokemon-market-tracker.md
│   ├── review-pokemon-market-tracker.md
│   ├── stories-pokemon-market-tracker.md
│   ├── tdd-pokemon-market-tracker.md
│   └── testplan-pokemon-market-tracker.md
├── polymarket-tracker/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-insider-tracker.md
│   ├── deploy-insider-tracker.md
│   ├── done-insider-tracker.md
│   ├── impl-backend-insider-tracker.md
│   ├── impl-frontend-insider-tracker.md
│   ├── meta.json
│   ├── prd-insider-tracker.md
│   ├── review-insider-tracker.md
│   ├── tdd-insider-tracker.md
│   └── testplan-insider-tracker.md
├── portfolio-site/
│   ├── PHASE.md
│   ├── TRACKER.md
│   ├── api-portfolio-site.md
│   ├── contact-submissions.jsonl
│   ├── deploy-portfolio-site.md
│   ├── done-portfolio-site.md
│   ├── impl-backend-portfolio-site.md
│   ├── impl-frontend-portfolio-site.md
│   ├── meta.json
│   ├── prd-portfolio-site.md
│   ├── review-portfolio-site.md
│   ├── tdd-portfolio-site.md
│   └── testplan-portfolio-site.md
└── restock-monitor/
    ├── PHASE.md
    ├── TRACKER.md
    ├── deploy-restock-monitor.md
    ├── deploy-restock-monitor-phase1.1.md
    ├── done-restock-monitor.md
    ├── impl-backend-restock-monitor.md
    ├── meta.json
    ├── prd-restock-monitor.md
    ├── review-restock-monitor.md
    ├── review-restock-monitor-phase1.1.md
    ├── stories-restock-monitor.md
    ├── tdd-restock-monitor.md
    ├── testplan-restock-monitor.md
    └── testplan-restock-monitor-phase1.1.md
```

---

# 10. Cron Job Configurations

## Pipeline Agents (7 jobs)

### coordinator-pipeline-sync
- **ID:** `00a7e398-af0f-4785-a305-6b13005e22e5`
- **Agent:** `coordinator`
- **Schedule:** `0 0,12,14,16,18,20,22 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** announce → telegram (8153891546)
- **Timeout:** 900s
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
You are the pipeline coordinator. Run your even-hour sync silently — do all your analysis internally, then output ONLY the formatted sync message below. Do not narrate your work, do not output analysis, do not output anything before the sync message.

INTERNAL STEPS (do not output these):

1. Scan every project directory under /Users/wynclaw/.openclaw/shared/pipeline/ for artifacts (prd-*.md, tdd-*.md, api-*.md, impl-*.md, review-*.md, testplan-*.md, bugs-*.md, deploy-*.md, done-*.md, needs-clarification.md).

2. Read the contents of any review-*.md files and check for '⚠️ TDD Issue — Nathan Action Required' or '⚠️ PRD Issue — Nathan Action Required' sections.

3. Compare file modification timestamps. If tdd-*.md is newer than impl-backend-*.md or impl-frontend-*.md, flag it as stale.

4. Update each project's TRACKER.md. Use 'Awaiting Auto-Pickup' when an artifact is in place for the next agent.

5. If a done-{slug}.md exists, set Overall Status: Complete in that project's TRACKER.md.

6. Update /Users/wynclaw/.openclaw/shared/pipeline/DASHBOARD.md.

7. Determine what needs Nathan's attention:
   - ✅ needs-clarification.md exists
   - ✅ Project has reached Deploy stage
   - ✅ Project stuck in same stage 2+ sync cycles with no new artifacts
   - ✅ review-*.md contains a ⚠️ TDD Issue or ⚠️ PRD Issue flag
   - ✅ tdd-*.md is newer than impl-*.md (stale impl)
   - ❌ Do NOT escalate active review loops, queued work, or things the pipeline handles automatically

OUTPUT (this is the only thing you should output — nothing before it, nothing after it):

🔄 Pipeline Sync — {time} PT

{For each project, use this format — one project per block, blank line between each}:
*{Project Name}*
{emoji} {Stage} — {one-line status summary}

Emoji guide: ✅ complete, ⏳ auto-pickup queued, 🔁 fix loop, ⚠️ needs Nathan, 🔄 in progress

{Omit entire section if nothing needs Nathan}
⚠️ *Needs Your Input*
• {project} — {one-line description of what's needed}

⏭️ Next sync: {next even hour} PT
```

---

### pm-intake-check
- **ID:** `47861933-9be7-4251-b6b6-49974b7ffbcc`
- **Agent:** `pm`
- **Schedule:** `0 13,15,17,19,21,23 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** none
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
Check /Users/wynclaw/.openclaw/shared/pipeline/ for PM work.

**Pre-check — skip if no work exists:**
Scan all project directories under /Users/wynclaw/.openclaw/shared/pipeline/. If there is no project directory that has a TRACKER.md where Requirements is 'Not Started' or 'In Progress' without a prd-*.md, AND no project has a needs-revision-prd-*.md file, stop immediately and do nothing.

Otherwise, proceed with the following conditions:

**Condition 1 — First requirements:**
A project directory has a TRACKER.md where the Requirements stage is 'Not Started' or 'In Progress' and no prd-*.md file exists yet. Read any intake notes or context in the TRACKER.md and write the PRD and stories files.

**Condition 2 — PRD revision:**
A needs-revision-prd-*.md file exists in a project directory. This file has been supplied by Nathan. Read it for correction instructions, then revise the existing prd-*.md (and stories-*.md if needed) accordingly. Delete the needs-revision-prd-*.md file when done.

After completing a PRD revision (Condition 2), if the changes affect scope, architecture, or acceptance criteria, write a needs-revision-tdd-{slug}.md file to the same project directory summarizing what changed in the PRD so the Architect can update the TDD accordingly. Be specific — list what was added, changed, or removed so the Architect doesn't have to diff the documents manually.

If the intake notes are too vague to write a PRD, create a file called /Users/wynclaw/.openclaw/shared/pipeline/{project}/needs-clarification.md listing what questions need answers.

If no work is found, do nothing.
```

---

### architect-design-check
- **ID:** `f9657287-9486-4e40-a310-511f84617349`
- **Agent:** `architect`
- **Schedule:** `0 13,15,17,19,21,23 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** none
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
Check /Users/wynclaw/.openclaw/shared/pipeline/ for architect work.

**Pre-check — skip if no work exists:**
Scan all project directories under /Users/wynclaw/.openclaw/shared/pipeline/. Read PHASE.md in each directory to determine the current phase N. If none of the following are true across any project, stop immediately and do nothing:
- Phase 1: a prd-*.md exists without a matching tdd-*.md or tdd-*-phase1.md
- Phase N>1: a prd-*.md exists without a matching tdd-*-phaseN.md
- A needs-revision-tdd-*.md file exists in any project directory

Otherwise, proceed with the following conditions:

**Condition 1 — First design (Phase 1):**
A prd-*.md exists but no tdd-*.md or tdd-*-phase1.md. Read the PRD and stories, then produce the TDD and API spec. Save them to the same project directory.

**Condition 2 — TDD revision:**
A needs-revision-tdd-*.md file exists in a project directory. This file has been supplied by Nathan. Read it for correction instructions, then revise the existing tdd-*.md (and api-*.md if needed) accordingly. Delete the needs-revision-tdd-*.md file when done.

**Condition 3 — Phase N>1 design:**
PHASE.md says phase N (N > 1) and no tdd-*-phaseN.md exists for that project. Read PHASE.md for the current phase scope. Read the existing PRD, TDD, and any context or needs-clarification files. Write a TDD covering only the current phase scope (do not re-cover prior phases). Save as tdd-{slug}-phaseN.md in the same directory.

If you encounter anything you cannot resolve without input from Nathan (missing information, ambiguous requirements, conflicting constraints), do NOT guess. Write a needs-clarification.md file to the project directory listing your specific questions, then stop. The coordinator will alert Nathan.

If no work is found, do nothing.
```

---

### backend-impl-check
- **ID:** `0197f970-8ff0-4544-aa66-ec0ef209dcd4`
- **Agent:** `backend`
- **Schedule:** `0 13,15,17,19,21,23 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** none
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
Check /Users/wynclaw/.openclaw/shared/pipeline/ for backend work.

**Pre-check — skip if no work exists:**
Scan all project directories under /Users/wynclaw/.openclaw/shared/pipeline/. Read PHASE.md in each directory to determine the current phase N. If none of the following are true across any project, stop immediately and do nothing:
- Phase 1: a tdd-*.md (or tdd-*-phase1.md) indicates backend work is needed, without a matching impl-backend-*.md or impl-backend-*-phase1.md
- Phase N>1: a tdd-*-phaseN.md indicates backend work without a matching impl-backend-*-phaseN.md
- A review-*.md (or review-*-phaseN.md for current phase) exists with verdict 'Changes Requested' AND no 'Engineer Response Submitted' verdict (i.e. engineer has not yet acted)
- A bugs-*.md (or bugs-*-phaseN.md for current phase) exists with backend-related bugs not yet marked Fixed

Otherwise, proceed with the following conditions:

**Phase awareness:** Before implementing, read PHASE.md to determine the current phase N and scope your implementation to that phase only. Do not implement features marked for future phases.

**Condition 1 — First implementation:**
A tdd-*.md (phase 1) or tdd-*-phaseN.md (phase N>1) exists that indicates backend work is needed, but no matching impl-backend-*.md or impl-backend-*-phaseN.md. Read the TDD and API spec. Scope to the current phase only. Implement the backend. For phase 1: save to impl-backend-{slug}.md. For phase N>1: save to impl-backend-{slug}-phaseN.md.

**Condition 2 — Review feedback:**
A review-{slug}.md (or review-{slug}-phaseN.md for current phase) exists with verdict 'Changes Requested' AND no 'Engineer Response Submitted' verdict, AND no ⚠️ TDD Issue or ⚠️ PRD Issue flag. Read the review and the existing impl file. Fix all requested backend changes, overwrite the impl file. Then update the review file by:
1. Changing the verdict line from 'Changes Requested' to 'Engineer Response Submitted'
2. Appending an '## Engineer Response' section listing each issue addressed (e.g. CR-001: [what was fixed])
Do NOT act on Changes Requested if the review contains a ⚠️ TDD Issue or ⚠️ PRD Issue flag — those require Nathan's decision before work continues.

**Condition 3 — QA bugs:**
A bugs-{slug}.md (or bugs-{slug}-phaseN.md for current phase) exists with backend-related bugs not yet marked Fixed. Read the bug report and the existing impl file, fix all critical backend bugs, overwrite the impl file, then update the bugs file to mark each fixed bug as 'Fixed'. Do NOT delete any files — the Reviewer will handle cleanup once all bugs across all engineers are marked Fixed.

If you encounter anything you cannot resolve without input from Nathan (missing information, unclear requirements, missing credentials or environment details), do NOT guess. Write a needs-clarification.md file to the project directory listing your specific questions, then stop. The coordinator will alert Nathan.

If no work is found across all three conditions, do nothing.
```

---

### frontend-impl-check
- **ID:** `e463f62f-2861-424d-8ec9-0e6afc775733`
- **Agent:** `frontend`
- **Schedule:** `0 13,15,17,19,21,23 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** none
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
Check /Users/wynclaw/.openclaw/shared/pipeline/ for frontend work.

**Pre-check — skip if no work exists:**
Scan all project directories under /Users/wynclaw/.openclaw/shared/pipeline/. Read PHASE.md in each directory to determine the current phase N. If none of the following are true across any project, stop immediately and do nothing:
- Phase 1: a tdd-*.md (or tdd-*-phase1.md) indicates frontend work is needed, without a matching impl-frontend-*.md or impl-frontend-*-phase1.md
- Phase N>1: a tdd-*-phaseN.md indicates frontend work without a matching impl-frontend-*-phaseN.md
- A review-*.md (or review-*-phaseN.md for current phase) exists with verdict 'Changes Requested' with frontend-related feedback AND no 'Engineer Response Submitted' verdict (i.e. engineer has not yet acted)
- A bugs-*.md (or bugs-*-phaseN.md for current phase) exists with frontend-related bugs not yet marked Fixed

Otherwise, proceed with the following conditions:

**Phase awareness:** Before implementing, read PHASE.md to determine the current phase N and scope your implementation to that phase only. Do not implement features marked for future phases.

**Condition 1 — First implementation:**
A tdd-*.md (phase 1) or tdd-*-phaseN.md (phase N>1) exists, the TDD indicates frontend work is needed, but no matching impl-frontend-*.md or impl-frontend-*-phaseN.md. Read the TDD. Scope to the current phase only. Implement the frontend. For phase 1: save to impl-frontend-{slug}.md. For phase N>1: save to impl-frontend-{slug}-phaseN.md.

**Condition 2 — Review feedback:**
A review-{slug}.md (or review-{slug}-phaseN.md for current phase) exists with verdict 'Changes Requested' with frontend-related feedback AND no 'Engineer Response Submitted' verdict, AND no ⚠️ TDD Issue or ⚠️ PRD Issue flag. Read the review and the existing impl file. Fix all requested frontend changes, overwrite the impl file. Then update the review file by:
1. Changing the verdict line from 'Changes Requested' to 'Engineer Response Submitted'
2. Appending an '## Engineer Response' section listing each issue addressed (e.g. CR-001: [what was fixed])
Do NOT act on Changes Requested if the review contains a ⚠️ TDD Issue or ⚠️ PRD Issue flag — those require Nathan's decision before work continues.

**Condition 3 — QA bugs:**
A bugs-{slug}.md (or bugs-{slug}-phaseN.md for current phase) exists with frontend-related bugs not yet marked Fixed. Read the bug report and the existing impl file, fix all critical frontend bugs, overwrite the impl file, then update the bugs file to mark each fixed bug as 'Fixed'. Do NOT delete any files — the Reviewer will handle cleanup once all bugs across all engineers are marked Fixed.

If you encounter anything you cannot resolve without input from Nathan (missing designs, unclear UX requirements, ambiguous component behavior), do NOT guess. Write a needs-clarification.md file to the project directory listing your specific questions, then stop. The coordinator will alert Nathan.

If no work is found across all three conditions, do nothing.
```

---

### reviewer-code-check
- **ID:** `a7f808d9-5391-42c0-a9cb-f11dc2c0f236`
- **Agent:** `reviewer`
- **Schedule:** `0 13,15,17,19,21,23 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** none
- **Model:** opus
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
Check /Users/wynclaw/.openclaw/shared/pipeline/ for reviewer work.

**Pre-check — skip if no work exists:**
Scan all project directories under /Users/wynclaw/.openclaw/shared/pipeline/. Read PHASE.md in each directory to determine the current phase N. If none of the following are true across any project, stop immediately and do nothing:
- Phase 1: impl-backend-*.md or impl-frontend-*.md (or *-phase1.md variants) exists without a corresponding review-*.md
- Phase N>1: impl-backend-*-phaseN.md or impl-frontend-*-phaseN.md exists without a corresponding review-*-phaseN.md
- A review-*.md (or review-*-phaseN.md for current phase) exists with verdict 'Engineer Response Submitted'
- A bugs-*.md (or bugs-*-phaseN.md for current phase) exists where all bugs are marked Fixed

Otherwise, proceed with the following conditions in priority order. If multiple conditions are true for the same project, handle Condition 3 first.

**Phase awareness:** Before reviewing, read PHASE.md to determine the current phase N and scope your review to that phase only. Do not flag missing features from future phases as issues.

**Condition 1 — New review needed:**
A project has impl-backend-*.md or impl-frontend-*.md (phase 1) or impl-*-phaseN.md (phase N>1) but no corresponding review file for that phase. Read the TDD, PRD, and implementation notes. Scope your review to the current phase only. Write a code review. For phase 1: save to review-{slug}.md. For phase N>1: save to review-{slug}-phaseN.md.

Use exactly one of these verdicts:
- **Approved** — no issues found, QA can proceed
- **Approved with Comments** — minor non-blocking observations only, QA can proceed
- **Changes Requested** — blocking issues found, engineer must fix before QA proceeds

While reviewing, evaluate all three layers:
- **Implementation issues** (code doesn't match TDD/PRD for current phase) → verdict 'Changes Requested'; list each issue with a CR-### identifier.
- **TDD/design issues** (fundamental flaw the engineer cannot resolve) → include a clearly marked section titled '⚠️ TDD Issue — Nathan Action Required'.
- **PRD issues** (fundamental flaw in requirements) → include a clearly marked section titled '⚠️ PRD Issue — Nathan Action Required'.

**Condition 2 — Re-review after engineer fix:**
A review file for the current phase exists with verdict 'Engineer Response Submitted'. Read the Engineer Response section, then re-review the updated impl files focusing on the specific items addressed. Scope to current phase only. Overwrite the review file with a completely fresh review.

**Condition 3 — Bug fix re-review (highest priority):**
A bugs file for the current phase exists where all bugs are marked Fixed. Read the updated impl files and verify all fixes. Then:
- Delete the bugs file and testplan file for this phase
- Write a completely fresh review file using the same three verdicts
- If Approved or Approved with Comments, QA re-triggers automatically
- If Changes Requested, engineers fix and follow the normal Condition 2 path

If you encounter anything you cannot resolve without input from Nathan, do NOT guess. Write a needs-clarification.md file to the project directory listing your specific questions, then stop.

If no work is found, do nothing.
```

---

### qa-test-check
- **ID:** `af088033-30e4-47fe-beea-df215925da05`
- **Agent:** `qa`
- **Schedule:** `0 13,15,17,19,21,23 * * *` (America/Los_Angeles)
- **Session:** isolated
- **Delivery:** none
- **Status:** disabled (5 consecutive errors — usage limit)
- **Prompt:**
```
Check /Users/wynclaw/.openclaw/shared/pipeline/ for QA work.

**Pre-check — skip if no work exists:**
Scan all project directories under /Users/wynclaw/.openclaw/shared/pipeline/. Read PHASE.md in each directory to determine the current phase N. If none of the following are true across any project, stop immediately and do nothing:
- Phase 1: a review-*.md (or review-*-phase1.md) showing 'Approved' or 'Approved with Comments' without a matching testplan-*.md
- Phase N>1: a review-*-phaseN.md showing 'Approved' or 'Approved with Comments' without a matching testplan-*-phaseN.md

Otherwise, proceed with the following condition:

**Phase awareness:** Before testing, read PHASE.md to determine the current phase N and scope your test plan to that phase's acceptance criteria only. Do not test against future phase requirements.

**Condition 1 — New test plan needed:**
A project has a review file for the current phase showing 'Approved' or 'Approved with Comments' but no corresponding testplan file for that phase. Read the PRD acceptance criteria and the review. Scope to the current phase acceptance criteria only. Write and execute a test plan. For phase 1: save to testplan-{slug}.md. For phase N>1: save to testplan-{slug}-phaseN.md. File any bugs to bugs-{slug}.md (phase 1) or bugs-{slug}-phaseN.md (phase N>1).

If you encounter anything you cannot resolve without input from Nathan (missing test environment, unclear acceptance criteria, access to services needed for testing), do NOT guess. Write a needs-clarification.md file to the project directory listing your specific questions, then stop. The coordinator will alert Nathan.

If no work is found, do nothing.
```

---

## Non-Pipeline Cron Jobs (19 jobs total — key ones below)

### WynBot Moltbook Heartbeat
- **ID:** `66049fc3-7458-43a5-8e4d-05df220c0973`
- **Agent:** `moltbot`
- **Schedule:** every 30 min
- **Timeout:** 600s
- **Delivery:** none
- **Status:** disabled (13 consecutive errors — usage limit)
- **Prompt:** *(Very long — covers identity load from SOUL.md, claim status check, social engagement on Moltbook, follow/unfollow evaluation on odd cycles, submolt discovery on even cycles, state persistence. Full prompt in cron list above.)*

### rs-sdk-bot-controller-phase3
- **ID:** `338aec6c-2ab6-44af-9593-b385ea653beb`
- **Agent:** `backend`
- **Schedule:** every 10 min
- **Timeout:** 300s
- **Delivery:** announce → discord (1468840008810107099)
- **Status:** disabled
- **Prompt:** *(RuneScape bot controller — reads Goal Tracker API, checks session health, handles stuck recovery, selects next goal by vote-decay scoring, spawns AI gameplay sessions. Full prompt in cron list above.)*

### NBA Daily Pipeline (Weekday + Weekend variants)
- **Weekday:** `3f2418de` — `0 15 * * 1-5` UTC
- **Weekend:** `eb8bcaf7` — `0 11 * * 0,6` PT
- **Model:** default (weekday), haiku (weekend)
- **Delivery:** none

### NBA Results Grading (Weekday + Weekend)
- **Weekday:** `c4f59dc9` — `20 15 * * 1-5` UTC
- **Weekend:** `33d43c7e` — `20 11 * * 0,6` PT
- **Model:** sonnet

### NBA Market Analyst (Weekday + Weekend)
- **Weekday:** `0d47999c` — `25 15 * * 1-5` UTC
- **Weekend:** `ba0041ae` — `25 11 * * 0,6` PT
- **Model:** sonnet

### NBA Matchup Analyst (Weekday + Weekend)
- **Weekday:** `7008feae` — `25 15 * * 1-5` UTC
- **Weekend:** `7c9b3f5a` — `25 11 * * 0,6` PT
- **Model:** sonnet

### NBA Synthesis Agent (Weekday + Weekend)
- **Weekday:** `f4b4f1ad` — `35 15 * * 1-5` UTC
- **Weekend:** `d6bf0c30` — `35 11 * * 0,6` PT
- **Model:** opus
- **Delivery:** announce → telegram (8153891546)

### MLB Data Pipeline
- **ID:** `e5cba8ec` — `55 10 * * *` PT
- **Model:** haiku
- **Timeout:** 900s
- **Delivery:** none

### MLB Results + Signals
- **ID:** `69e843fc` — `20 11 * * *` PT
- **Model:** sonnet
- **Delivery:** none

### MLB Market Analyst
- **ID:** `3308174f` — `25 11 * * *` PT
- **Model:** sonnet
- **Delivery:** none

### MLB Matchup Analyst
- **ID:** `b3683031` — `25 11 * * *` PT
- **Model:** sonnet
- **Delivery:** none

### MLB Synthesis Agent
- **ID:** `81535395` — `45 11 * * *` PT
- **Model:** opus
- **Timeout:** 900s
- **Delivery:** announce → telegram (8153891546)
- **Prompt includes:** 4000-char output constraint for Telegram

### Morning Priority Check-in
- **ID:** `2deacd2e` — `0 8 * * *` PT
- **Model:** haiku
- **Delivery:** announce → telegram
- **Reads:** tasks/Priorities.md, runs gmail-packages.py

### Pokémon Market Tracker — Price Fetch
- **ID:** `31525fe0` — every 4 hours
- **Agent:** `devops`
- **Timeout:** 120s
- **Delivery:** none

---

*Note: All 26 cron jobs are currently **disabled** — most hit Anthropic usage limits (consecutive errors). The pipeline and sports pipelines will resume once usage is replenished.*
