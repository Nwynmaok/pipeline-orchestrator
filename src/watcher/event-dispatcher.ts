import { dirname, basename } from 'node:path';
import type { AgentId, DispatchRequest, TriggerCondition } from '../types.js';

/**
 * Maps file change events to agent dispatch requests.
 * Includes throttling to prevent cascading dispatches.
 */
export class EventDispatcher {
  // Track last dispatch time per agent+project to throttle
  private lastDispatch: Map<string, number> = new Map();

  constructor(private throttleMs: number) {}

  /**
   * Given a file change event, determine what agent(s) to dispatch.
   * Returns dispatch requests or empty array if no dispatch needed.
   */
  mapFileEvent(
    filePath: string,
    filename: string,
    eventType: 'add' | 'change',
  ): DispatchRequest[] {
    const requests: DispatchRequest[] = [];
    const projectDir = dirname(filePath);
    const project = basename(projectDir);

    // Map filename patterns to agent triggers
    const mappings = getFileMappings(filename, eventType);

    for (const mapping of mappings) {
      const key = `${mapping.agent}:${project}:${mapping.condition}`;

      // Throttle: skip if this agent+project+condition was dispatched recently
      const lastTime = this.lastDispatch.get(key) ?? 0;
      if (Date.now() - lastTime < this.throttleMs) {
        continue;
      }

      this.lastDispatch.set(key, Date.now());

      requests.push({
        agent: mapping.agent,
        project,
        trigger: 'event',
        condition: mapping.condition,
        priority: mapping.priority,
        enqueuedAt: new Date(),
      });
    }

    return requests;
  }

  /**
   * Check if we're in active hours for hybrid mode.
   */
  static isActiveHours(startHour: number, endHour: number, timezone: string): boolean {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false, timeZone: timezone });
    const currentHour = parseInt(timeStr.split(':')[0], 10);

    if (endHour === 0) {
      // Active from startHour to midnight
      return currentHour >= startHour;
    }
    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    }
    // Wraps midnight
    return currentHour >= startHour || currentHour < endHour;
  }
}

// ─── File → Agent Mappings ──────────────────────────────────────────────────

interface FileMapping {
  agent: AgentId;
  condition: TriggerCondition;
  priority: number;
}

function getFileMappings(filename: string, eventType: 'add' | 'change'): FileMapping[] {
  const mappings: FileMapping[] = [];

  // New PRD → trigger architect
  if (filename.startsWith('prd-') && eventType === 'add') {
    mappings.push({ agent: 'architect', condition: 'first-design', priority: 10 });
  }

  // New TDD → trigger backend (and potentially frontend via pre-check)
  if (filename.startsWith('tdd-') && eventType === 'add') {
    mappings.push({ agent: 'backend', condition: 'first-impl', priority: 10 });
    // Frontend is handled by pre-check — dispatcher will determine if TDD has frontend work
  }

  // New/updated impl → trigger reviewer
  if ((filename.startsWith('impl-backend-') || filename.startsWith('impl-frontend-')) && eventType === 'add') {
    mappings.push({ agent: 'reviewer', condition: 'new-review', priority: 10 });
  }

  // Review file changes — depends on content, but we can trigger based on common patterns
  if (filename.startsWith('review-')) {
    if (eventType === 'add') {
      // New review → could trigger QA (if approved) or engineer (if changes requested)
      // The orchestrator will re-scan and dispatcher will determine the correct action
      mappings.push({ agent: 'qa', condition: 'new-testplan', priority: 10 });
      mappings.push({ agent: 'backend', condition: 'review-feedback', priority: 20 });
      mappings.push({ agent: 'frontend', condition: 'review-feedback', priority: 20 });
    }
    if (eventType === 'change') {
      // Updated review (ERS) → trigger reviewer re-review
      mappings.push({ agent: 'reviewer', condition: 're-review', priority: 25 });
    }
  }

  // Bugs file — updated (all fixed) → trigger reviewer
  if (filename.startsWith('bugs-') && eventType === 'change') {
    mappings.push({ agent: 'reviewer', condition: 'bug-fix-re-review', priority: 30 });
  }

  // done file → trigger coordinator
  if (filename.startsWith('done-') && eventType === 'add') {
    mappings.push({ agent: 'coordinator', condition: 'coordinator-sync', priority: 5 });
  }

  // Nathan-authored revision files
  if (filename.startsWith('needs-revision-prd-') && eventType === 'add') {
    mappings.push({ agent: 'pm', condition: 'prd-revision', priority: 15 });
  }
  if (filename.startsWith('needs-revision-tdd-') && eventType === 'add') {
    mappings.push({ agent: 'architect', condition: 'tdd-revision', priority: 15 });
  }

  // New TRACKER.md (project initialized) → trigger PM
  if (filename === 'TRACKER.md' && eventType === 'add') {
    mappings.push({ agent: 'pm', condition: 'first-requirements', priority: 10 });
  }

  return mappings;
}
