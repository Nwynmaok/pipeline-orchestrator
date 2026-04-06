import type { AgentId, ProjectState, DispatchDecision } from '../types.js';
import type { AgentRunner } from '../agents/agent-runner.js';

/**
 * Run a cheap Haiku pre-check to determine if an agent truly has work.
 * This catches false positives from the dispatcher's heuristic checks
 * (e.g. "does this TDD actually indicate frontend work?").
 *
 * Returns true if the agent should proceed, false to skip.
 */
export async function preCheck(
  runner: AgentRunner,
  decision: DispatchDecision,
  project: ProjectState,
): Promise<boolean> {
  // Some conditions are always unambiguous — skip the Haiku call
  const skipPreCheck: string[] = [
    'prd-revision',        // needs-revision-prd file exists — always work
    'tdd-revision',        // needs-revision-tdd file exists — always work
    'review-feedback',     // review with Changes Requested — always work
    'bug-fix',             // bugs with Open status — always work
    're-review',           // Engineer Response Submitted — always work
    'bug-fix-re-review',   // all bugs Fixed — always work
    'coordinator-sync',    // coordinator always runs
  ];

  if (skipPreCheck.includes(decision.condition)) {
    return true;
  }

  // For ambiguous conditions, ask Haiku
  const system = `You are a pre-check validator. Determine if there is actual work for the ${decision.agent} agent.
Respond with ONLY "YES" or "NO".`;

  const context = buildPreCheckContext(decision, project);
  const response = await runner.callHaiku(system, context);
  const answer = response.text.trim().toUpperCase();

  return answer.startsWith('YES');
}

function buildPreCheckContext(decision: DispatchDecision, project: ProjectState): string {
  const lines = [
    `Agent: ${decision.agent}`,
    `Project: ${project.slug}`,
    `Phase: ${project.phase.current}`,
    `Condition: ${decision.condition}`,
    '',
  ];

  switch (decision.condition) {
    case 'first-requirements':
      lines.push('Question: Does the project TRACKER.md indicate new requirements work is needed (Requirements stage is Not Started or In Progress) with no PRD written yet?');
      break;
    case 'first-design':
    case 'phase-design':
      lines.push('Question: Does a PRD exist without a corresponding TDD for the current phase?');
      break;
    case 'first-impl':
      if (decision.agent === 'frontend') {
        lines.push('Question: Does the TDD indicate frontend/UI work is needed? (Check for React, HTML, CSS, frontend components, UI, dashboard, etc. Backend-only projects should return NO.)');
      } else {
        lines.push('Question: Does the TDD indicate backend work is needed?');
      }
      break;
    case 'new-review':
      lines.push('Question: Do implementation files exist without a corresponding review for the current phase?');
      break;
    case 'new-testplan':
      lines.push('Question: Does a review with Approved/Approved with Comments exist without a testplan for the current phase?');
      break;
  }

  // Add artifact list for context
  const artifacts = Object.entries(project.artifacts)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `  ${k}: ${v}`);
  if (artifacts.length > 0) {
    lines.push('', 'Existing artifacts:', ...artifacts);
  }

  return lines.join('\n');
}
