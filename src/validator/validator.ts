import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectState, ValidationResult, ValidationGateType } from '../types.js';
import type { AgentRunner } from '../agents/agent-runner.js';
import { buildPrdValidationPrompt, parsePrdValidationResponse } from './gates/prd-gate.js';
import { buildTddValidationPrompt, parseTddValidationResponse } from './gates/tdd-gate.js';
import { buildReviewValidationPrompt, parseReviewValidationResponse } from './gates/review-gate.js';
import { buildQaValidationPrompt, parseQaValidationResponse } from './gates/qa-gate.js';

/**
 * Run a validation gate on a newly written artifact.
 * Uses Haiku for cheap structural checks before allowing stage advancement.
 */
export async function validateArtifact(
  runner: AgentRunner,
  project: ProjectState,
  gate: ValidationGateType,
): Promise<ValidationResult> {
  switch (gate) {
    case 'prd':
      return validatePrd(runner, project);
    case 'tdd':
      return validateTdd(runner, project);
    case 'review':
      return validateReview(runner, project);
    case 'qa':
      return validateQa(runner, project);
  }
}

/**
 * Determine which validation gate to run based on what artifact was just written.
 */
export function getGateForArtifact(filename: string): ValidationGateType | null {
  if (filename.startsWith('prd-')) return 'prd';
  if (filename.startsWith('tdd-')) return 'tdd';
  if (filename.startsWith('review-')) return 'review';
  if (filename.startsWith('testplan-')) return 'qa';
  return null;
}

// ─── Individual gates ───────────────────────────────────────────────────────

async function validatePrd(runner: AgentRunner, project: ProjectState): Promise<ValidationResult> {
  if (!project.artifacts.prd) {
    return { gate: 'prd', passed: false, feedback: 'No PRD file found' };
  }
  const content = readFileSync(join(project.dir, project.artifacts.prd), 'utf-8');
  const { system, user } = buildPrdValidationPrompt(content);
  const response = await runner.callHaiku(system, user);
  return parsePrdValidationResponse(response.text);
}

async function validateTdd(runner: AgentRunner, project: ProjectState): Promise<ValidationResult> {
  if (!project.artifacts.tdd) {
    return { gate: 'tdd', passed: false, feedback: 'No TDD file found' };
  }
  const content = readFileSync(join(project.dir, project.artifacts.tdd), 'utf-8');
  const prdFilename = project.artifacts.prd ?? 'unknown-prd.md';
  const { system, user } = buildTddValidationPrompt(content, prdFilename);
  const response = await runner.callHaiku(system, user);
  return parseTddValidationResponse(response.text);
}

async function validateReview(runner: AgentRunner, project: ProjectState): Promise<ValidationResult> {
  if (!project.artifacts.review) {
    return { gate: 'review', passed: false, feedback: 'No review file found' };
  }
  const content = readFileSync(join(project.dir, project.artifacts.review), 'utf-8');
  const { system, user } = buildReviewValidationPrompt(content);
  const response = await runner.callHaiku(system, user);
  return parseReviewValidationResponse(response.text);
}

async function validateQa(runner: AgentRunner, project: ProjectState): Promise<ValidationResult> {
  if (!project.artifacts.testplan) {
    return { gate: 'qa', passed: false, feedback: 'No test plan file found' };
  }
  const testplanContent = readFileSync(join(project.dir, project.artifacts.testplan), 'utf-8');

  let prdContent = 'No PRD available';
  if (project.artifacts.prd) {
    prdContent = readFileSync(join(project.dir, project.artifacts.prd), 'utf-8');
    // Extract just the acceptance criteria section to save tokens
    const acMatch = prdContent.match(/## Acceptance Criteria[\s\S]*?(?=\n## |$)/);
    if (acMatch) prdContent = acMatch[0];
  }

  const { system, user } = buildQaValidationPrompt(testplanContent, prdContent);
  const response = await runner.callHaiku(system, user);
  return parseQaValidationResponse(response.text);
}
