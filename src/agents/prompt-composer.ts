import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentId, ProjectState, TriggerCondition } from '../types.js';
import type { Config } from '../config.js';
import { getPromptTemplate } from './prompts/index.js';

/**
 * Compose the full system prompt for an agent run.
 * Assembles 6 sections in order:
 *   1. Agent persona
 *   2. Operating instructions
 *   3. CONVENTIONS.md
 *   4. Agent RULES.md
 *   5. Project context
 *   6. Handoff context
 */
export function composeSystemPrompt(params: {
  agent: AgentId;
  project: ProjectState;
  condition: TriggerCondition;
  config: Config;
}): string {
  const { agent, project, config } = params;
  const template = getPromptTemplate(agent);
  const pipelineDir = config.pipeline.dir;

  const sections: string[] = [];

  // ── Section 1: Persona ──
  sections.push(section('AGENT PERSONA', template.persona));

  // ── Section 2: Operating Instructions ──
  const instructions = template.operatingInstructions
    .replace(/\{pipelineDir\}/g, pipelineDir)
    .replace(/\{project\}/g, project.slug);
  sections.push(section('OPERATING INSTRUCTIONS', instructions));

  // ── Section 3: Conventions ──
  const conventions = readFileSafe(join(pipelineDir, config.pipeline.conventionsFile));
  if (conventions) {
    sections.push(section('PIPELINE CONVENTIONS', conventions));
  }

  // ── Section 4: Learned Rules ──
  const rules = loadAgentRules(agent, config);
  if (rules) {
    sections.push(section('LEARNED RULES', rules));
  }

  // ── Section 5: Project Context ──
  sections.push(section('PROJECT CONTEXT', buildProjectContext(project)));

  // ── Section 6: Handoff Context ──
  if (project.specialFiles.handoff) {
    const handoff = readFileSafe(join(project.dir, project.specialFiles.handoff));
    if (handoff) {
      sections.push(section('HANDOFF CONTEXT', handoff));
    }
  }

  // ── File Operation Instructions ──
  sections.push(section('FILE OPERATIONS', FILE_OPS_INSTRUCTIONS));

  return sections.join('\n\n');
}

/**
 * Compose a minimal system prompt for the coordinator sync.
 * The coordinator sees all projects, not just one.
 */
export function composeCoordinatorPrompt(params: {
  config: Config;
  projectSummaries: string;
}): string {
  const { config, projectSummaries } = params;
  const template = getPromptTemplate('coordinator');
  const pipelineDir = config.pipeline.dir;

  const sections: string[] = [];

  sections.push(section('AGENT PERSONA', template.persona));

  const instructions = template.operatingInstructions
    .replace(/\{pipelineDir\}/g, pipelineDir);
  sections.push(section('OPERATING INSTRUCTIONS', instructions));

  const conventions = readFileSafe(join(pipelineDir, config.pipeline.conventionsFile));
  if (conventions) {
    sections.push(section('PIPELINE CONVENTIONS', conventions));
  }

  const rules = loadAgentRules('coordinator', config);
  if (rules) {
    sections.push(section('LEARNED RULES', rules));
  }

  sections.push(section('CURRENT PIPELINE STATE', projectSummaries));

  sections.push(section('FILE OPERATIONS', FILE_OPS_INSTRUCTIONS));

  return sections.join('\n\n');
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function section(title: string, content: string): string {
  const bar = '═'.repeat(60);
  return `${bar}\n${title}\n${bar}\n${content}`;
}

function buildProjectContext(project: ProjectState): string {
  const lines: string[] = [
    `Current project: ${project.slug}`,
    `Project directory: ${project.dir}`,
    `Current phase: ${project.phase.current}`,
  ];

  if (project.phase.scope) {
    lines.push(`Phase scope: ${project.phase.scope}`);
  }

  // List existing artifacts
  const artifacts = Object.entries(project.artifacts)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `  ${k}: ${v}`);

  if (artifacts.length > 0) {
    lines.push('', 'Available artifacts for this phase:');
    lines.push(...artifacts);
  }

  // List special files
  const specials = Object.entries(project.specialFiles)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `  ${k}: ${v}`);

  if (specials.length > 0) {
    lines.push('', 'Special files:');
    lines.push(...specials);
  }

  // Review state
  if (project.review) {
    lines.push('', `Review verdict: ${project.review.verdict}`);
    if (project.review.hasTddIssueFlag) lines.push('  ⚠️ TDD Issue flag present');
    if (project.review.hasPrdIssueFlag) lines.push('  ⚠️ PRD Issue flag present');
    if (project.review.changeRequests.length > 0) {
      lines.push(`  Change requests: ${project.review.changeRequests.join(', ')}`);
    }
  }

  // Bugs state
  if (project.bugs) {
    const open = project.bugs.bugs.filter(b => b.status === 'Open').length;
    const fixed = project.bugs.bugs.filter(b => b.status === 'Fixed').length;
    lines.push('', `Bugs: ${open} open, ${fixed} fixed`);
  }

  // TRACKER.md content (if we have it)
  const tracker = readFileSafe(join(project.dir, 'TRACKER.md'));
  if (tracker) {
    lines.push('', '--- TRACKER.md ---', tracker);
  }

  return lines.join('\n');
}

function loadAgentRules(agent: AgentId, config: Config): string | null {
  // Try rules directory first, then fall back to pipeline directory
  const rulesPath = join(config.data.rulesDir, `${agent}.md`);
  const rules = readFileSafe(rulesPath);
  if (rules) return rules;
  return null;
}

function readFileSafe(path: string): string | null {
  try {
    const content = readFileSync(path, 'utf-8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

const FILE_OPS_INSTRUCTIONS = `When you need to write, update, or delete files, wrap each operation in markers:

To write or overwrite a file:
<<<WRITE_FILE: {relative-path-from-project-dir}>>>
{file contents}
<<<END_FILE>>>

To delete a file:
<<<DELETE_FILE: {relative-path-from-project-dir}>>>

The orchestrator will parse these markers and execute the file operations.
Always use filenames relative to the project directory.
You may include multiple file operations in a single response.
Any text outside these markers is treated as your reasoning/analysis (not written to disk).`;
