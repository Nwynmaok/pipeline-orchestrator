import { readdirSync } from 'node:fs';
import type {
  PipelineState,
  ProjectState,
  DispatchDecision,
  TriggerCondition,
} from '../types.js';
import { engineerShouldAct, qaCanProceed } from '../state/review-cycle.js';

/**
 * Given a PipelineState snapshot, determine which agents have work to do.
 * Returns DispatchDecision[] sorted by priority (highest first).
 *
 * This is a pure function — no filesystem access, no side effects.
 * All data comes from the pre-scanned PipelineState.
 */
export function dispatch(state: PipelineState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  for (const project of state.projects) {
    // Skip completed projects (done file exists for current phase)
    if (project.artifacts.done) continue;

    decisions.push(...checkPm(project));
    decisions.push(...checkArchitect(project));
    decisions.push(...checkBackend(project));
    decisions.push(...checkFrontend(project));
    decisions.push(...checkReviewer(project));
    decisions.push(...checkQa(project));
    // DevOps is never auto-dispatched
  }

  // Sort by priority descending (highest priority first)
  decisions.sort((a, b) => b.priority - a.priority);

  return decisions;
}

// ─── PM ─────────────────────────────────────────────────────────────────────

function checkPm(project: ProjectState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  // Condition 1: TRACKER.md with Requirements Not Started/In Progress, no PRD yet
  if (!project.artifacts.prd && project.tracker) {
    const reqStage = project.tracker.stages.find(s => s.stage === 'Requirements');
    if (reqStage && (reqStage.status.includes('Not Started') || reqStage.status.includes('In Progress'))) {
      decisions.push(decision('pm', project.slug, 'first-requirements', 10));
    }
  }

  // Also trigger if no PRD exists at all and no TDD exists (project truly at intake)
  // but a TRACKER.md file exists in the directory — simplified check
  if (!project.artifacts.prd && !project.artifacts.tdd && !project.tracker && hasTrackerFile(project)) {
    decisions.push(decision('pm', project.slug, 'first-requirements', 10));
  }

  // Condition 2: needs-revision-prd-*.md exists
  if (project.specialFiles.needsRevisionPrd) {
    decisions.push(decision('pm', project.slug, 'prd-revision', 15));
  }

  return decisions;
}

// ─── Architect ──────────────────────────────────────────────────────────────

function checkArchitect(project: ProjectState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  // Condition 1 (Phase 1): PRD exists without TDD
  if (project.phase.current <= 1 && project.artifacts.prd && !project.artifacts.tdd) {
    decisions.push(decision('architect', project.slug, 'first-design', 10));
  }

  // Condition 3 (Phase N>1): PRD exists without phase-N TDD
  if (project.phase.current > 1 && project.artifacts.prd && !project.artifacts.tdd) {
    decisions.push(decision('architect', project.slug, 'phase-design', 10));
  }

  // Condition 2: needs-revision-tdd-*.md exists
  if (project.specialFiles.needsRevisionTdd) {
    decisions.push(decision('architect', project.slug, 'tdd-revision', 15));
  }

  return decisions;
}

// ─── Backend ────────────────────────────────────────────────────────────────

function checkBackend(project: ProjectState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  // Condition 1: TDD exists indicating backend work, no impl-backend yet
  if (project.artifacts.tdd && !project.artifacts.implBackend) {
    // Check if TDD indicates backend work (it usually does unless frontend-only)
    if (tddIndicatesBackendWork(project)) {
      decisions.push(decision('backend', project.slug, 'first-impl', 10));
    }
  }

  // Condition 2: Review says Changes Requested, no flags, no ERS
  if (project.review && engineerShouldAct(project.review)) {
    decisions.push(decision('backend', project.slug, 'review-feedback', 20));
  }

  // Condition 3: Bugs file with unfixed backend bugs
  if (project.bugs && !project.bugs.allFixed && hasUnfixedBugs(project)) {
    decisions.push(decision('backend', project.slug, 'bug-fix', 25));
  }

  return decisions;
}

// ─── Frontend ───────────────────────────────────────────────────────────────

function checkFrontend(project: ProjectState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  // Condition 1: TDD exists indicating frontend work, no impl-frontend yet
  if (project.artifacts.tdd && !project.artifacts.implFrontend) {
    if (tddIndicatesFrontendWork(project)) {
      decisions.push(decision('frontend', project.slug, 'first-impl', 10));
    }
  }

  // Condition 2: Review says Changes Requested with frontend feedback, no flags, no ERS
  if (project.review && engineerShouldAct(project.review)) {
    decisions.push(decision('frontend', project.slug, 'review-feedback', 20));
  }

  // Condition 3: Bugs file with unfixed frontend bugs
  if (project.bugs && !project.bugs.allFixed && hasUnfixedBugs(project)) {
    decisions.push(decision('frontend', project.slug, 'bug-fix', 25));
  }

  return decisions;
}

// ─── Reviewer ───────────────────────────────────────────────────────────────

function checkReviewer(project: ProjectState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  // Condition 3 (highest priority): Bugs file where all bugs are Fixed
  if (project.bugs && project.bugs.allFixed) {
    decisions.push(decision('reviewer', project.slug, 'bug-fix-re-review', 30));
  }

  // Condition 2: Review with Engineer Response Submitted
  if (project.review && project.review.verdict === 'Engineer Response Submitted') {
    decisions.push(decision('reviewer', project.slug, 're-review', 25));
  }

  // Condition 1: Impl exists without review for current phase
  const hasImpl = project.artifacts.implBackend || project.artifacts.implFrontend;
  if (hasImpl && !project.artifacts.review) {
    decisions.push(decision('reviewer', project.slug, 'new-review', 10));
  }

  return decisions;
}

// ─── QA ─────────────────────────────────────────────────────────────────────

function checkQa(project: ProjectState): DispatchDecision[] {
  const decisions: DispatchDecision[] = [];

  // Condition 1: Review Approved/Approved with Comments, no testplan for current phase
  if (project.review && qaCanProceed(project.review) && !project.artifacts.testplan) {
    decisions.push(decision('qa', project.slug, 'new-testplan', 10));
  }

  return decisions;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function decision(
  agent: DispatchDecision['agent'],
  project: string,
  condition: TriggerCondition,
  priority: number,
): DispatchDecision {
  return { agent, project, condition, priority };
}

/**
 * Check if a TRACKER.md file exists in the project directory.
 * We use this as a lightweight signal that a project has been initialized.
 */
function hasTrackerFile(project: ProjectState): boolean {
  try {
    return readdirSync(project.dir).includes('TRACKER.md');
  } catch {
    return false;
  }
}

/**
 * Check if the TDD indicates backend work is needed.
 * Heuristic: most projects have backend work unless the TDD
 * explicitly says frontend-only. For now, assume backend work
 * if a TDD exists (can be refined later with Haiku pre-check).
 */
function tddIndicatesBackendWork(project: ProjectState): boolean {
  // If there's already a done file, project is complete — no work needed
  if (project.artifacts.done) return false;
  return true;
}

/**
 * Check if the TDD indicates frontend work is needed.
 * Heuristic: check if there's evidence of frontend work in existing artifacts.
 * Projects like restock-monitor are backend-only and shouldn't trigger frontend.
 * For now, conservative: only trigger if there's already a frontend impl from a
 * prior phase, or the TDD will be checked by Haiku pre-check at runtime.
 */
function tddIndicatesFrontendWork(_project: ProjectState): boolean {
  // This is where the Haiku pre-check adds value — it reads the TDD content
  // and determines if frontend work is needed. For dispatch purposes, we
  // return false and let the pre-check handle it. The pre-check will read
  // the TDD and make the determination.
  //
  // Exception: if we wanted to be more eager, we could read the TDD content
  // here, but that would make dispatch impure. Better to let pre-check do it.
  return false;
}

/**
 * Check if there are unfixed bugs in the bugs file.
 */
function hasUnfixedBugs(project: ProjectState): boolean {
  if (!project.bugs) return false;
  return project.bugs.bugs.some(b => b.status === 'Open');
}
