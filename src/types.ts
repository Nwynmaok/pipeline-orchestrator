// ─── Agent System ───────────────────────────────────────────────────────────

export const AGENT_IDS = ['coordinator', 'pm', 'architect', 'frontend', 'backend', 'reviewer', 'qa', 'devops'] as const;
export type AgentId = typeof AGENT_IDS[number];

export type ModelId = 'claude-sonnet-4-6' | 'claude-opus-4-6' | 'claude-haiku-4-5';

export type CallType = 'run' | 'precheck' | 'validate' | 'handoff';

export interface AgentConfig {
  id: AgentId;
  model: ModelId;
  maxConversationTurns: number;
  timeoutMs: number;
  canWrite: string[];   // artifact prefixes this agent may write
  canDelete: string[];  // artifact prefixes this agent may delete
}

// ─── Pipeline State ─────────────────────────────────────────────────────────

export interface PipelineState {
  projects: ProjectState[];
  scannedAt: Date;
}

export interface ProjectState {
  slug: string;
  dir: string;
  phase: PhaseInfo;
  tracker: TrackerInfo | null;
  artifacts: ArtifactMap;
  specialFiles: SpecialFiles;
  review: ReviewState | null;
  bugs: BugsState | null;
}

export interface PhaseInfo {
  current: number;
  scope: string;
  history: PhaseHistoryEntry[];
}

export interface PhaseHistoryEntry {
  phase: number;
  name: string;
  status: 'complete' | 'in-progress';
}

export interface TrackerInfo {
  projectName: string;
  overallStatus: string;
  stages: TrackerStage[];
  lastUpdated: string;
}

export interface TrackerStage {
  stage: string;
  agent: AgentId | 'N/A';
  status: string;
  artifacts: string;
  notes: string;
}

export interface ArtifactMap {
  prd: string | null;
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
  patch: string | null;
}

export interface SpecialFiles {
  needsRevisionPrd: string | null;
  needsRevisionTdd: string | null;
  needsClarification: string | null;
  context: string | null;
  handoff: string | null;
}

// ─── Review Cycle ───────────────────────────────────────────────────────────

export type ReviewVerdict =
  | 'Approved'
  | 'Approved with Comments'
  | 'Changes Requested'
  | 'Engineer Response Submitted';

export interface ReviewState {
  verdict: ReviewVerdict;
  hasTddIssueFlag: boolean;
  hasPrdIssueFlag: boolean;
  hasEngineerResponse: boolean;
  changeRequests: string[];
}

export interface BugEntry {
  id: string;
  description: string;
  status: 'Open' | 'Fixed';
  source: 'QA' | 'Coordinator';
}

export interface BugsState {
  bugs: BugEntry[];
  allFixed: boolean;
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

export type TriggerCondition =
  | 'first-requirements'      // PM condition 1
  | 'prd-revision'            // PM condition 2
  | 'first-design'            // Architect condition 1
  | 'tdd-revision'            // Architect condition 2
  | 'phase-design'            // Architect condition 3
  | 'first-impl'              // Backend/Frontend condition 1
  | 'review-feedback'         // Backend/Frontend condition 2
  | 'bug-fix'                 // Backend/Frontend condition 3
  | 'new-review'              // Reviewer condition 1
  | 're-review'               // Reviewer condition 2
  | 'bug-fix-re-review'       // Reviewer condition 3 (highest priority)
  | 'new-testplan'            // QA condition 1
  | 'coordinator-sync';       // Coordinator (always runs on schedule)

export interface DispatchDecision {
  agent: AgentId;
  project: string;
  condition: TriggerCondition;
  priority: number;  // higher = run first
}

export interface DispatchRequest {
  agent: AgentId;
  project: string;
  trigger: 'cron' | 'event' | 'kick';
  condition: TriggerCondition;
  priority: number;
  enqueuedAt: Date;
}

export type SchedulingMode = 'cron' | 'event' | 'hybrid';

// ─── Conversation History ───────────────────────────────────────────────────

export interface ConversationTurn {
  ts: string;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  runId: string;
}

// ─── Run Log ────────────────────────────────────────────────────────────────

export interface RunLogEntry {
  runId: string;
  ts: string;
  agent: AgentId;
  project: string;
  trigger: 'cron' | 'event' | 'kick';
  condition: TriggerCondition;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  artifactsWritten: string[];
  artifactsDeleted: string[];
  validationPassed: boolean | null;
  error: string | null;
}

// ─── XP / Pipeline Quest ────────────────────────────────────────────────────

export const XP_EVENT_TYPES = [
  'clean_pass_review',
  'clean_pass_qa',
  'bug_found_by_reviewer',
  'bug_found_by_qa',
  'rule_learned',
  'blocker_detected_early',
  'successful_deploy',
  'feature_implemented',
  'bug_fixed',
] as const;
export type XpEventType = typeof XP_EVENT_TYPES[number];

export interface XpEvent {
  ts: string;
  agent: AgentId;
  event: XpEventType;
  xp: number;
  project: string;
  note: string;
}

export interface AgentAttributes {
  str: number;  // implementation quality
  dex: number;  // speed/efficiency
  con: number;  // consistency
  int: number;  // design/architecture
  wis: number;  // review/testing insight
  cha: number;  // communication clarity
}

export interface AgentStat {
  totalXp: number;
  level: number;
  skills: Record<string, number>;
  attributes: AgentAttributes;
}

export type AgentStatsMap = Record<string, AgentStat>;

// ─── Agent Runner ───────────────────────────────────────────────────────────

export interface AgentRunParams {
  agent: AgentId;
  project: ProjectState;
  condition: TriggerCondition;
}

export interface AgentRunResult {
  runId: string;
  agent: AgentId;
  project: string;
  artifactsWritten: string[];
  artifactsDeleted: string[];
  response: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  error: string | null;
}

// ─── File Operations (parsed from agent responses) ─────────────────────────

export interface FileWriteOp {
  path: string;
  content: string;
}

export interface FileDeleteOp {
  path: string;
}

export interface ParsedAgentResponse {
  writes: FileWriteOp[];
  deletes: FileDeleteOp[];
  rawText: string;
}

// ─── Staleness ──────────────────────────────────────────────────────────────

export interface StaleArtifact {
  project: string;
  tddFile: string;
  tddMtime: Date;
  implFile: string;
  implMtime: Date;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export type ValidationGateType = 'prd' | 'tdd' | 'review' | 'qa';

export interface ValidationResult {
  gate: ValidationGateType;
  passed: boolean;
  feedback: string | null;  // specific issues if failed
}
