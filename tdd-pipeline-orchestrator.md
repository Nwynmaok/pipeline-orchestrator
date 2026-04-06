# TDD: Pipeline Orchestrator
**Project:** pipeline-orchestrator
**Author:** Claude (Architect)
**Date:** 2026-04-05
**Status:** Draft
**References:** prd-pipeline-orchestrator.md, pipeline-export-2026-04-05.md

---

## 1. Project Structure

```
pipeline-orchestrator/
├── src/
│   ├── index.ts                    # Daemon entry point — starts scheduler + watcher + CLI server
│   ├── config.ts                   # Loads and validates config from config.yaml
│   ├── types.ts                    # Shared TypeScript types and enums
│   │
│   ├── orchestrator/
│   │   ├── orchestrator.ts         # Top-level run loop: pick agent → validate preconditions → run → validate output → handoff
│   │   ├── dispatcher.ts           # Decides which agent(s) to dispatch based on pipeline state
│   │   └── pipeline-scanner.ts     # Scans project directories, builds PipelineState snapshot
│   │
│   ├── agents/
│   │   ├── agent-runner.ts         # Calls Claude API with composed system prompt, handles response
│   │   ├── prompt-composer.ts      # Assembles system prompt: persona + CONVENTIONS.md + RULES.md + project context
│   │   ├── conversation-store.ts   # Persists and retrieves per-agent conversation history
│   │   └── prompts/                # Static prompt templates per agent (ported from cron prompts)
│   │       ├── coordinator.ts
│   │       ├── pm.ts
│   │       ├── architect.ts
│   │       ├── backend.ts
│   │       ├── frontend.ts
│   │       ├── reviewer.ts
│   │       ├── qa.ts
│   │       └── devops.ts
│   │
│   ├── scheduler/
│   │   ├── scheduler.ts            # Registers and manages node-cron jobs
│   │   └── schedule-config.ts      # Agent schedule definitions (cron expressions, timezones)
│   │
│   ├── watcher/
│   │   ├── file-watcher.ts         # fs.watch on pipeline directory, debounced
│   │   └── event-dispatcher.ts     # Maps file changes to agent dispatch decisions
│   │
│   ├── validator/
│   │   ├── validator.ts            # Runs Haiku-based validation on artifacts
│   │   ├── gates/                  # Per-artifact validation rules
│   │   │   ├── prd-gate.ts
│   │   │   ├── tdd-gate.ts
│   │   │   ├── review-gate.ts
│   │   │   └── qa-gate.ts
│   │   └── pre-check.ts            # "Is there work?" scan using Haiku
│   │
│   ├── state/
│   │   ├── phase-manager.ts        # Reads/writes PHASE.md, determines artifact suffixes
│   │   ├── review-cycle.ts         # Review cycle state machine
│   │   ├── staleness-detector.ts   # Compares TDD vs impl timestamps
│   │   ├── artifact-resolver.ts    # Resolves artifact filenames given project slug + phase
│   │   └── handoff-manager.ts      # Writes handoff summaries, manages context flow between agents
│   │
│   ├── quest/
│   │   ├── xp-tracker.ts           # Appends to agent-events.jsonl
│   │   ├── stats-manager.ts        # Reads/writes agent-stats.json, computes levels
│   │   └── xp-table.ts             # XP values per event type
│   │
│   ├── telegram/
│   │   └── telegram.ts             # Sends messages via Telegram Bot API
│   │
│   └── cli/
│       ├── cli.ts                  # CLI entry point (commander.js)
│       ├── commands/
│       │   ├── status.ts           # pipeline status
│       │   ├── start.ts            # pipeline start {project}
│       │   ├── kick.ts             # pipeline kick {agent}
│       │   ├── stats.ts            # pipeline stats
│       │   ├── logs.ts             # pipeline logs {agent}
│       │   └── cron.ts             # pipeline cron list
│       └── ipc.ts                  # Communicates with running daemon (Unix socket)
│
├── config.yaml                     # Main configuration file
├── package.json
├── tsconfig.json
├── ecosystem.config.js             # PM2 config
├── prd-pipeline-orchestrator.md
├── tdd-pipeline-orchestrator.md
└── pipeline-export-2026-04-05.md
```

### Entry Points

| Entry Point | Purpose | How It Runs |
|---|---|---|
| `src/index.ts` | Daemon — scheduler, watcher, orchestrator | `pm2 start ecosystem.config.js` |
| `src/cli/cli.ts` | CLI commands | `npx pipeline <command>` or linked as `pipeline` |

### Key Dependencies

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Claude API calls |
| `node-cron` | Cron scheduling |
| `commander` | CLI framework |
| `yaml` | Config file parsing |
| `chokidar` | File watching (more reliable than raw `fs.watch`) |

---

## 2. Core Modules

### 2.1 Pipeline Scanner (`orchestrator/pipeline-scanner.ts`)

Scans the shared pipeline directory and builds a `PipelineState` snapshot — the single source of truth for dispatch decisions.

```typescript
interface PipelineState {
  projects: ProjectState[];
  scannedAt: Date;
}

interface ProjectState {
  slug: string;
  dir: string;
  phase: number;
  phaseScope: string;
  tracker: TrackerState | null;
  artifacts: ArtifactMap;
  specialFiles: SpecialFiles;
}
```

**How it works:**
1. `readdir` on the pipeline root to get project directories
2. For each project: read `PHASE.md` → parse phase number, read `TRACKER.md` → parse stages, glob for all artifacts → build `ArtifactMap`
3. Returns a frozen `PipelineState` snapshot — all dispatch decisions read from this, never from live filesystem mid-run

### 2.2 Dispatcher (`orchestrator/dispatcher.ts`)

Given a `PipelineState`, determines which agents have work. Implements the exact trigger conditions from the OpenClaw cron prompts:

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

The dispatcher returns `DispatchDecision[]` — a list of `{ agent, project, condition, priority }` tuples.

### 2.3 Agent Runner (`agents/agent-runner.ts`)

Executes a single agent run against the Claude API.

```typescript
async function runAgent(params: {
  agent: AgentId;
  project: ProjectState;
  condition: TriggerCondition;
  config: AgentConfig;
}): Promise<AgentRunResult>
```

**Flow:**
1. Compose system prompt via `prompt-composer.ts`
2. Load conversation history (last N turns) via `conversation-store.ts`
3. Build the user message (the cron prompt logic — what files to read, what to produce)
4. Call Claude API with the appropriate model
5. Parse the response — extract artifacts to write, files to delete, tracker updates
6. Write artifacts to the pipeline directory
7. Append conversation turn to history
8. Return `AgentRunResult` with what was produced

**File I/O:** The agent runner handles all filesystem writes that the Claude response dictates. The response is parsed for file write instructions. The agent runner enforces artifact ownership — an agent can only write its own artifact types.

### 2.4 Prompt Composer (`agents/prompt-composer.ts`)

Assembles the full system prompt for each agent run:

```
[1] Agent persona (static per agent — equivalent to SOUL.md)
[2] Agent operating instructions (the cron prompt logic — equivalent to AGENTS.md)
[3] CONVENTIONS.md (read from pipeline directory, shared across all agents)
[4] Agent RULES.md (read from pipeline directory or orchestrator data dir)
[5] Project context (TRACKER.md, PHASE.md, relevant artifacts for this run)
[6] Handoff summary (if available — what the upstream agent produced and why)
```

Sections [1] and [2] are defined in `src/agents/prompts/{agent}.ts`. Sections [3]-[6] are read dynamically at runtime.

### 2.5 Validator (`validator/validator.ts`)

Runs Haiku-based validation gates on artifacts before they advance to the next stage.

**Pre-check (before agent run):** A cheap Haiku call that answers "does this agent have real work to do?" — prevents wasting Sonnet/Opus tokens on idle runs. This replaces the "pre-check" logic currently embedded in each cron prompt.

**Post-check (after agent writes artifact):** Validates the artifact meets structural requirements:

| Gate | Required Sections | Model |
|---|---|---|
| PRD | Problem Statement, Goals, User Stories, Acceptance Criteria, Scope | Haiku |
| TDD | References PRD filename, Architecture, Data Model, API Contract, Task Breakdown | Haiku |
| Review | Exactly one of: Approved, Approved with Comments, Changes Requested, Engineer Response Submitted | Haiku |
| QA | Testplan traces to PRD acceptance criteria | Haiku |

**On failure:** Writes a `context-{slug}.md` with specific feedback and sets the dispatch to route back to the owning agent.

### 2.6 Handoff Manager (`state/handoff-manager.ts`)

After an agent completes work, generates a 2-3 sentence summary of what was produced and key decisions. Uses Haiku to summarize.

```typescript
async function createHandoff(params: {
  agent: AgentId;
  project: string;
  artifactsWritten: string[];
  agentResponse: string;
}): Promise<void>
```

Writes `handoff-{slug}.md` to the project directory. The next agent's prompt composer reads this for context.

### 2.7 Review Cycle State Machine (`state/review-cycle.ts`)

Implements the review cycle as a deterministic state machine:

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

The state machine is a pure function: `(currentFiles, fileContents) → ReviewState`. No mutable state — derived entirely from what's on disk.

### 2.8 Phase Manager (`state/phase-manager.ts`)

```typescript
function readPhase(projectDir: string): { phase: number; scope: string; history: PhaseEntry[] }
function getArtifactName(base: string, slug: string, phase: number): string
function incrementPhase(projectDir: string, newScope: string): void  // coordinator only
```

- Phase 1: flat naming (`tdd-{slug}.md`)
- Phase 2+: suffixed (`tdd-{slug}-phase2.md`)
- `incrementPhase` is gated — only callable when the orchestrator is running as the coordinator agent

### 2.9 Staleness Detector (`state/staleness-detector.ts`)

On every coordinator sync, compares `mtime` of TDD vs impl files:

```typescript
function detectStaleness(project: ProjectState): StaleArtifact[]
```

Returns a list of impl files whose TDD is newer. The coordinator includes these in the sync message for Nathan.

### 2.10 Telegram Delivery (`telegram/telegram.ts`)

Direct Telegram Bot API integration — no OpenClaw dependency.

```typescript
async function sendMessage(text: string): Promise<void>
```

Uses `POST https://api.telegram.org/bot{TOKEN}/sendMessage` with Markdown parse mode. Bot token and chat ID from config.

Message format matches current pipeline sync:
```
🔄 Pipeline Sync — {time} PT

*{Project Name}*
{emoji} {Stage} — {status}

⚠️ *Needs Your Input*
• {project} — {what's needed}

⏭️ Next sync: {next even hour} PT
```

### 2.11 CLI (`cli/cli.ts`)

Commands communicate with the running daemon via a Unix domain socket at `/tmp/pipeline-orchestrator.sock`.

| Command | Action |
|---|---|
| `pipeline status` | Read and display `DASHBOARD.md` |
| `pipeline start {name}` | Create project dir with `TRACKER.md` + `PHASE.md`, trigger PM |
| `pipeline kick {agent}` | Queue an immediate run for the specified agent |
| `pipeline stats` | Display Pipeline Quest agent levels and XP |
| `pipeline logs {agent}` | Show recent run history from `data/run-log.jsonl` |
| `pipeline cron list` | List all scheduled jobs with next fire time and status |

If the daemon isn't running, commands that only read files (`status`, `stats`) work directly; commands that need dispatch (`start`, `kick`) print an error.

---

## 3. Data Models

### 3.1 Agent Configuration

```typescript
type AgentId = 'coordinator' | 'pm' | 'architect' | 'frontend' | 'backend' | 'reviewer' | 'qa' | 'devops';

interface AgentConfig {
  id: AgentId;
  model: 'claude-sonnet-4-6' | 'claude-opus-4-6' | 'claude-haiku-4-5';
  maxConversationTurns: number;  // how many prior turns to include
  timeoutMs: number;
  canWrite: string[];  // artifact prefixes this agent owns (e.g. ['prd-', 'stories-'] for PM)
}
```

**Model assignments:**
| Agent | Model | Rationale |
|---|---|---|
| coordinator | sonnet | Sync/tracking work, high volume |
| pm | sonnet | PRD writing |
| architect | opus | Design decisions need strongest reasoning |
| frontend | sonnet | Implementation |
| backend | sonnet | Implementation |
| reviewer | opus | Code review quality is critical |
| qa | sonnet | Test plan writing |
| devops | sonnet | Deploy plans |
| (validation) | haiku | Cheap structural checks |
| (pre-checks) | haiku | "Is there work?" scans |

### 3.2 Pipeline State (in-memory, rebuilt each run)

```typescript
interface ArtifactMap {
  prd: string | null;       // filename if exists
  stories: string | null;
  tdd: string | null;
  api: string | null;
  implBackend: string | null;
  implFrontend: string | null;
  review: string | null;
  testplan: string | null;
  bugs: string | null;
  deploy: string | null;
  done: string | null;
}

interface SpecialFiles {
  needsRevisionPrd: string | null;
  needsRevisionTdd: string | null;
  needsClarification: string | null;
  context: string | null;
  patch: string | null;
  handoff: string | null;
}

// Review file parsed state
interface ReviewState {
  verdict: 'Approved' | 'Approved with Comments' | 'Changes Requested' | 'Engineer Response Submitted';
  hasTddIssueFlag: boolean;
  hasPrdIssueFlag: boolean;
  hasEngineerResponse: boolean;
  changeRequests: string[];  // CR-001, CR-002, etc.
}

// Bug file parsed state
interface BugsState {
  bugs: { id: string; description: string; status: 'Open' | 'Fixed'; source: 'QA' | 'Coordinator' }[];
  allFixed: boolean;
}
```

### 3.3 Conversation History (`data/conversations/{agent}/{project}.jsonl`)

Each line is a JSON object representing one turn:

```typescript
interface ConversationTurn {
  ts: string;          // ISO 8601
  role: 'user' | 'assistant';
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  runId: string;       // links to run-log entry
}
```

Stored per agent per project. The prompt composer loads the last `maxConversationTurns` entries (default: 5) and injects them as prior conversation context.

### 3.4 Run Log (`data/run-log.jsonl`)

```typescript
interface RunLogEntry {
  runId: string;
  ts: string;
  agent: AgentId;
  project: string;
  trigger: 'cron' | 'event' | 'kick';
  condition: string;        // which trigger condition matched
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  artifactsWritten: string[];
  artifactsDeleted: string[];
  validationPassed: boolean | null;
  error: string | null;
}
```

### 3.5 XP Events (`agent-events.jsonl` — existing format, preserved)

```typescript
interface XpEvent {
  ts: string;
  agent: AgentId;
  event: XpEventType;
  xp: number;
  project: string;
  note: string;
}

type XpEventType =
  | 'clean_pass_review'    // +25
  | 'clean_pass_qa'        // +30
  | 'bug_found_by_reviewer' // -10
  | 'bug_found_by_qa'      // -15
  | 'rule_learned'         // +15
  | 'blocker_detected_early' // +20
  | 'successful_deploy'    // +35
  | 'feature_implemented'  // +20
  | 'bug_fixed';           // +15
```

### 3.6 Agent Stats (`agent-stats.json` — existing format, preserved)

```typescript
interface AgentStats {
  [agentId: string]: {
    totalXp: number;
    level: number;
    skills: { [skill: string]: number };
    attributes: {
      str: number;  // implementation quality
      dex: number;  // speed/efficiency
      con: number;  // consistency
      int: number;  // design/architecture
      wis: number;  // review/testing insight
      cha: number;  // communication clarity
    };
  };
}
```

---

## 4. Claude API Integration

### 4.1 SDK Usage

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const response = await client.messages.create({
  model: agentConfig.model,
  max_tokens: 8192,
  system: composedSystemPrompt,
  messages: conversationHistory,
});
```

### 4.2 System Prompt Composition

The system prompt is assembled by `prompt-composer.ts` in this order:

```
═══════════════════════════════════════
SECTION 1: AGENT PERSONA
═══════════════════════════════════════
You are the {role} agent in a multi-agent development pipeline.
{Static persona description — tone, expertise, responsibilities}

═══════════════════════════════════════
SECTION 2: OPERATING INSTRUCTIONS
═══════════════════════════════════════
{The full cron prompt logic from the export, parameterized:
 - Pre-check conditions
 - Trigger conditions 1, 2, 3...
 - Output format requirements
 - File naming rules}

═══════════════════════════════════════
SECTION 3: CONVENTIONS
═══════════════════════════════════════
{Contents of CONVENTIONS.md — read fresh each run}

═══════════════════════════════════════
SECTION 4: LEARNED RULES
═══════════════════════════════════════
{Contents of RULES.md for this agent — read fresh each run.
 Empty section if no rules yet.}

═══════════════════════════════════════
SECTION 5: PROJECT CONTEXT
═══════════════════════════════════════
Current project: {slug}
Current phase: {N}
Phase scope: {scope from PHASE.md}

TRACKER.md contents:
{full TRACKER.md}

Available artifacts for this phase:
{list of existing artifact filenames}

═══════════════════════════════════════
SECTION 6: HANDOFF CONTEXT
═══════════════════════════════════════
{Contents of handoff-{slug}.md if exists — what the upstream agent produced}
```

### 4.3 Model Selection

The orchestrator selects the model based on the call type:

```typescript
function getModel(agent: AgentId, callType: 'run' | 'precheck' | 'validate' | 'handoff'): string {
  if (callType === 'precheck' || callType === 'validate' || callType === 'handoff') {
    return 'claude-haiku-4-5';
  }
  return AGENT_MODELS[agent]; // sonnet or opus per config
}
```

### 4.4 Response Handling

Agent responses are text (markdown). The orchestrator needs to extract what files to write/modify/delete. Two approaches considered:

**Chosen approach: Structured output instructions.** The system prompt tells the agent to wrap file operations in markers:

```
<<<WRITE_FILE: path/to/file.md>>>
{file contents}
<<<END_FILE>>>

<<<DELETE_FILE: path/to/file.md>>>
```

The agent runner parses these markers and executes the file operations. This is deterministic, doesn't require a second API call, and matches how the OpenClaw system already worked (agents write files directly).

**Artifact ownership enforcement:** Before writing, the agent runner checks that the target file's prefix is in the agent's `canWrite` list. Violations are logged and blocked.

### 4.5 Token Budget Management

- Pre-checks use Haiku (~$0.001 per call) — run for all agents, most will return "no work"
- Validation gates use Haiku (~$0.001 per call) — run only when an artifact is produced
- Handoff summaries use Haiku (~$0.001 per call) — run only after successful artifact write
- Agent runs use Sonnet/Opus — the expensive calls, but only fire when there's real work
- Conversation history is capped at 5 turns to limit input tokens

**Estimated daily cost (hybrid mode, active pipeline):**
- 7 pre-checks x 6 cron windows = 42 Haiku calls ≈ $0.04
- ~3-5 agent runs per day (Sonnet) ≈ $0.50-1.00
- ~1-2 agent runs per day (Opus) ≈ $0.50-1.00
- Validation + handoffs ≈ $0.01
- Coordinator sync x 7 windows ≈ $0.35
- **Total: ~$1-2.50/day** (vs estimated $5-10/day on OpenClaw with blind polling)

---

## 5. Scheduling Architecture

### 5.1 Cron Mode (default — OpenClaw-compatible)

Uses `node-cron` to register jobs matching the existing schedule:

```typescript
// Coordinator: even hours, 12 PM - 12 AM PT
cron.schedule('0 0,12,14,16,18,20,22 * * *', () => orchestrator.runCoordinator(), {
  timezone: 'America/Los_Angeles'
});

// All other agents: odd hours, 12 PM - 12 AM PT
const agentIds: AgentId[] = ['pm', 'architect', 'backend', 'frontend', 'reviewer', 'qa'];
cron.schedule('0 13,15,17,19,21,23 * * *', () => orchestrator.runAgentCycle(agentIds), {
  timezone: 'America/Los_Angeles'
});
```

On each odd-hour tick, `runAgentCycle` does:
1. Scan pipeline state
2. For each agent, run pre-check (Haiku) — skip if no work
3. For agents with work, run sequentially (to avoid conflicting writes)
4. After each run, validate output, write handoff, log XP

### 5.2 Event-Driven Mode

Uses `chokidar` to watch the pipeline directory:

```typescript
const watcher = chokidar.watch(config.pipelineDir, {
  ignoreInitial: true,
  depth: 2,
  awaitWriteFinish: { stabilityThreshold: 2000 }  // debounce — wait for file to finish writing
});

watcher.on('add', (path) => eventDispatcher.onFileCreated(path));
watcher.on('change', (path) => eventDispatcher.onFileChanged(path));
```

The `event-dispatcher.ts` maps file events to agent triggers:

| File Created/Changed | Triggers |
|---|---|
| `prd-*.md` | architect (Condition 1) |
| `tdd-*.md` | backend, frontend (Condition 1) |
| `impl-backend-*.md`, `impl-frontend-*.md` | reviewer (Condition 1) |
| `review-*.md` (Approved) | qa (Condition 1) |
| `review-*.md` (Changes Requested) | backend/frontend (Condition 2) |
| `review-*.md` (ERS) | reviewer (Condition 2) |
| `bugs-*.md` (all Fixed) | reviewer (Condition 3) |
| `done-*.md` | coordinator (mark Complete) |
| `needs-revision-prd-*.md` | pm (Condition 2) |
| `needs-revision-tdd-*.md` | architect (Condition 2) |
| `TRACKER.md` (new project) | pm (Condition 1) |

Event dispatch is throttled: max 1 run per agent per 5 minutes to prevent cascading.

### 5.3 Hybrid Mode (recommended)

Combines both:
- **During active hours (12 PM - 12 AM PT):** Event-driven dispatch with cron as fallback
- **Outside active hours:** No dispatch (matches current behavior)
- **Coordinator always runs on cron** — sync messages should be on a predictable schedule

The cron jobs still fire, but the dispatcher checks a "last run" timestamp per agent per project — if the agent already ran for this condition within the current cron window, skip.

### 5.4 Dispatch Queue

All dispatch (cron, event, CLI kick) goes through a single FIFO queue:

```typescript
interface DispatchRequest {
  agent: AgentId;
  project: string;
  trigger: 'cron' | 'event' | 'kick';
  priority: number;  // reviewer Condition 3 (bug re-review) is highest
  enqueuedAt: Date;
}
```

The queue is processed sequentially to prevent two agents writing to the same project simultaneously. Requests for the same `(agent, project, condition)` are deduplicated.

---

## 6. Configuration

### 6.1 config.yaml

```yaml
# Pipeline Orchestrator Configuration

anthropic:
  apiKey: ${ANTHROPIC_API_KEY}  # from environment variable

pipeline:
  dir: /Users/wynclaw/.openclaw/shared/pipeline
  conventionsFile: CONVENTIONS.md  # relative to pipeline.dir

data:
  dir: ./data  # orchestrator internal data (conversations, run logs)
  rulesDir: ./rules  # RULES.md files per agent (or read from pipeline dir)

agents:
  coordinator:
    model: claude-sonnet-4-6
    maxConversationTurns: 5
    timeoutMs: 900000
  pm:
    model: claude-sonnet-4-6
    maxConversationTurns: 5
    timeoutMs: 600000
  architect:
    model: claude-opus-4-6
    maxConversationTurns: 5
    timeoutMs: 900000
  frontend:
    model: claude-sonnet-4-6
    maxConversationTurns: 5
    timeoutMs: 600000
  backend:
    model: claude-sonnet-4-6
    maxConversationTurns: 5
    timeoutMs: 600000
  reviewer:
    model: claude-opus-4-6
    maxConversationTurns: 5
    timeoutMs: 900000
  qa:
    model: claude-sonnet-4-6
    maxConversationTurns: 5
    timeoutMs: 600000
  devops:
    model: claude-sonnet-4-6
    maxConversationTurns: 3
    timeoutMs: 300000

scheduling:
  mode: hybrid  # cron | event | hybrid
  timezone: America/Los_Angeles
  activeHours:
    start: 12  # noon PT
    end: 0     # midnight PT
  coordinator:
    cron: "0 0,12,14,16,18,20,22 * * *"
  agents:
    cron: "0 13,15,17,19,21,23 * * *"
  eventThrottleMs: 300000  # 5 min — max 1 event-driven run per agent per project

telegram:
  botToken: ${TELEGRAM_BOT_TOKEN}
  chatId: "8153891546"

validation:
  enabled: true
  model: claude-haiku-4-5

precheck:
  enabled: true
  model: claude-haiku-4-5
```

### 6.2 Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=...
```

### 6.3 PM2 Configuration (`ecosystem.config.js`)

```javascript
module.exports = {
  apps: [{
    name: 'pipeline-orchestrator',
    script: './dist/index.js',
    cwd: '/Users/wynclaw/projects/pipeline-orchestrator',
    env: {
      NODE_ENV: 'production',
    },
    max_memory_restart: '512M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
  }]
};
```

---

## 7. Migration Plan

### 7.1 Directory Strategy

**Decision: Keep using `/Users/wynclaw/.openclaw/shared/pipeline/` as the default path.**

Rationale:
- 11 project directories are already there with established artifacts
- Agent RULES.md files reference this path
- CONVENTIONS.md references this path
- Changing it means updating every hardcoded path in CONVENTIONS.md and all rules
- The `pipeline.dir` config key allows changing it later with a single config update

**What moves to the orchestrator's own data dir:**
- Conversation history → `./data/conversations/`
- Run logs → `./data/run-log.jsonl`
- RULES.md files → read from a `./rules/` directory (or from the pipeline dir — configurable)

**What stays in the pipeline directory (no migration needed):**
- All project directories and artifacts
- CONVENTIONS.md
- DASHBOARD.md
- `agent-events.jsonl` → stays at `/Users/wynclaw/.openclaw/shared/agent-events.jsonl`
- `agent-stats.json` → stays at `/Users/wynclaw/.openclaw/shared/agent-stats.json`

### 7.2 RULES.md Migration

OpenClaw stored RULES.md in per-agent workspace directories (e.g. `workspace-backend/RULES.md`). The orchestrator needs access to these.

**Approach:** Copy the existing RULES.md files into `./rules/{agent}.md` during initial setup. The orchestrator reads from this directory. A CLI command (`pipeline rules sync`) can re-export them if needed.

### 7.3 CONVENTIONS.md Update

After the orchestrator is running, update CONVENTIONS.md to:
1. Remove references to OpenClaw-specific concepts (sessions, delivery channels)
2. Update the XP event logging instruction (no longer a bash `echo >>` — the orchestrator handles it)
3. Keep all artifact naming, phase, review, and bug conventions unchanged

### 7.4 Backward Compatibility

- Existing TRACKER.md and DASHBOARD.md formats are preserved exactly
- Existing PHASE.md format is preserved exactly
- Existing artifact naming is preserved exactly
- XP event JSONL format is preserved exactly
- agent-stats.json format is preserved exactly
- The orchestrator is a drop-in replacement for the OpenClaw cron system — same inputs, same outputs

---

## 8. Task Breakdown

Tasks are ordered by dependency. Each task produces a testable increment.

### Phase 1: Foundation (no Claude API calls yet)

**Task 1: Project scaffolding**
- Initialize Node.js/TypeScript project
- Set up tsconfig, package.json, build scripts
- Install dependencies: `@anthropic-ai/sdk`, `node-cron`, `commander`, `yaml`, `chokidar`
- Create directory structure
- **Depends on:** nothing

**Task 2: Configuration loader**
- Implement `config.ts` — parse `config.yaml`, validate required fields, resolve env vars
- Create `config.yaml` with all settings
- **Depends on:** Task 1

**Task 3: Type definitions**
- Define all TypeScript types in `types.ts`
- Agent IDs, artifact maps, pipeline state, review state, etc.
- **Depends on:** Task 1

**Task 4: Pipeline scanner**
- Implement `pipeline-scanner.ts` — scan directories, parse PHASE.md, build ArtifactMap
- Implement `artifact-resolver.ts` — resolve filenames given slug + phase
- Implement `phase-manager.ts` — read/write PHASE.md
- Test against the live pipeline directory (read-only)
- **Depends on:** Tasks 2, 3

**Task 5: Dispatcher**
- Implement `dispatcher.ts` — all 8 agent trigger conditions
- Implement `review-cycle.ts` — review verdict parsing and state derivation
- Implement `staleness-detector.ts` — TDD vs impl timestamp comparison
- Test: given the current pipeline state, verify correct dispatch decisions
- **Depends on:** Task 4

### Phase 2: Claude API Integration

**Task 6: Agent runner + prompt composer**
- Implement `prompt-composer.ts` — assemble system prompts from sections
- Implement `agent-runner.ts` — call Claude API, parse response, handle file markers
- Implement `conversation-store.ts` — read/write JSONL conversation history
- Port all 8 agent prompt templates from the export into `src/agents/prompts/`
- Test: run a single agent (PM) against a test project
- **Depends on:** Tasks 4, 5

**Task 7: Validation gates**
- Implement `validator.ts` and all 4 gate modules
- Implement `pre-check.ts` — Haiku-based "is there work?" scan
- Test: validate a known-good PRD passes, a bad PRD fails
- **Depends on:** Task 6

**Task 8: Handoff manager**
- Implement `handoff-manager.ts` — generate summaries via Haiku, write handoff files
- **Depends on:** Task 6

### Phase 3: Scheduling + Orchestration

**Task 9: Scheduler**
- Implement `scheduler.ts` — register cron jobs with node-cron
- Implement `schedule-config.ts` — define cron expressions
- Wire up: cron tick → dispatcher → pre-check → agent runner → validator → handoff
- **Depends on:** Tasks 5, 6, 7, 8

**Task 10: File watcher + event dispatch**
- Implement `file-watcher.ts` — chokidar setup with debouncing
- Implement `event-dispatcher.ts` — map file changes to agent triggers
- Implement hybrid mode logic (events during active hours, cron as fallback)
- Implement dispatch queue with deduplication
- **Depends on:** Task 9

**Task 11: Daemon entry point**
- Implement `index.ts` — start scheduler, watcher, IPC server
- Implement graceful shutdown (SIGTERM/SIGINT)
- Create `ecosystem.config.js` for PM2
- Test: daemon starts, cron fires, agent runs, shuts down cleanly
- **Depends on:** Tasks 9, 10

### Phase 4: Integrations

**Task 12: Telegram delivery**
- Implement `telegram.ts` — POST to Telegram Bot API
- Wire coordinator sync output to Telegram delivery
- Test: send a test sync message
- **Depends on:** Task 11

**Task 13: XP tracking**
- Implement `xp-tracker.ts` — append to agent-events.jsonl
- Implement `stats-manager.ts` — read/update agent-stats.json
- Implement `xp-table.ts` — event type → XP value mapping
- Wire into agent runner: auto-log XP after successful runs, reviews, QA passes
- **Depends on:** Task 11

### Phase 5: CLI

**Task 14: CLI commands**
- Implement `cli.ts` with commander.js
- Implement all 6 commands: status, start, kick, stats, logs, cron list
- Implement `ipc.ts` — Unix socket communication with daemon
- Link as `pipeline` binary in package.json
- **Depends on:** Task 11

### Phase 6: Polish + Cutover

**Task 15: RULES.md migration**
- Copy existing RULES.md files from OpenClaw workspace dirs to `./rules/`
- Verify prompt composer injects them correctly
- **Depends on:** Task 6

**Task 16: CONVENTIONS.md update**
- Update CONVENTIONS.md to remove OpenClaw references
- Update XP logging instructions (orchestrator handles it now)
- Keep all other conventions unchanged
- **Depends on:** Task 13

**Task 17: Integration testing**
- Run full pipeline cycle against a test project: create → PM → Architect → Backend → Review → QA
- Verify cron timing, event dispatch, validation gates, Telegram delivery, XP logging
- Verify existing 11 project directories are unaffected (read-only validation)
- **Depends on:** All previous tasks

**Task 18: PM2 deployment**
- Deploy to Mac Mini via PM2
- Set up log rotation
- Verify daemon survives reboot
- Disable old OpenClaw cron jobs (already disabled due to usage limits)
- **Depends on:** Task 17

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
| 1 | Directory path | Keep `/Users/wynclaw/.openclaw/shared/pipeline/` — configurable via `pipeline.dir`. Rename later if desired. |
| 2 | Conversation history depth | 5 turns default. Configurable per agent. Full history on disk, only last N injected into prompt. |
| 3 | Default mode | Hybrid. Events for speed during active hours, cron as safety net. Coordinator always on cron. |
| 4 | Cost budget | Target $2-3/day. Pre-checks on Haiku + event-driven handoffs should achieve this. Add cost tracking to run log for monitoring. |
