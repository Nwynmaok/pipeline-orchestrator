import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentId, XpEvent, XpEventType } from '../types.js';
import { XP_VALUES } from './xp-table.js';

/**
 * Appends XP events to agent-events.jsonl.
 * Uses the existing file format from the OpenClaw pipeline.
 */
export class XpTracker {
  constructor(private eventsFile: string) {}

  /**
   * Log an XP event.
   */
  log(agent: AgentId, event: XpEventType, project: string, note: string): void {
    const xpEvent: XpEvent = {
      ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), // Match existing format (no ms)
      agent,
      event,
      xp: XP_VALUES[event],
      project,
      note,
    };

    const dir = dirname(this.eventsFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    appendFileSync(this.eventsFile, JSON.stringify(xpEvent) + '\n');
  }

  /**
   * Determine which XP events to log based on an agent run result.
   * Call this after a successful agent run.
   */
  logForRun(params: {
    agent: AgentId;
    project: string;
    artifactsWritten: string[];
    artifactsDeleted: string[];
  }): void {
    const { agent, project, artifactsWritten, artifactsDeleted } = params;

    // Feature implemented — engineer wrote an impl file
    if (artifactsWritten.some(f => f.startsWith('impl-'))) {
      this.log(agent, 'feature_implemented', project, `Wrote ${artifactsWritten.filter(f => f.startsWith('impl-')).join(', ')}`);
    }

    // Bug fixed — engineer updated bugs file
    if (artifactsWritten.some(f => f.startsWith('bugs-'))) {
      if (agent === 'backend' || agent === 'frontend') {
        this.log(agent, 'bug_fixed', project, 'Marked bugs as Fixed');
      }
    }

    // Clean pass review — reviewer wrote Approved/Approved with Comments
    if (agent === 'reviewer' && artifactsWritten.some(f => f.startsWith('review-'))) {
      // We'd need to read the review content to know the verdict
      // For now, log as clean_pass_review — the verdict check can be refined
      this.log(agent, 'clean_pass_review', project, `Wrote ${artifactsWritten.filter(f => f.startsWith('review-')).join(', ')}`);
    }

    // Bug found by reviewer — reviewer wrote a review with Changes Requested
    // (This requires reading the review content — deferred to validator integration)

    // Clean pass QA — QA wrote testplan without bugs
    if (agent === 'qa' && artifactsWritten.some(f => f.startsWith('testplan-'))) {
      if (!artifactsWritten.some(f => f.startsWith('bugs-'))) {
        this.log(agent, 'clean_pass_qa', project, 'QA passed — no bugs filed');
      } else {
        // QA found bugs — negative XP for the author(s)
        this.log(agent, 'bug_found_by_qa', project, 'QA filed bugs');
      }
    }

    // Bug fix re-review — reviewer deleted bugs + testplan (cleanup)
    if (agent === 'reviewer' && artifactsDeleted.some(f => f.startsWith('bugs-'))) {
      // This means the reviewer approved after bug fixes
    }

    // Successful deploy — devops wrote done file
    if (agent === 'devops' && artifactsWritten.some(f => f.startsWith('done-'))) {
      this.log(agent, 'successful_deploy', project, `Deployed — ${artifactsWritten.filter(f => f.startsWith('done-')).join(', ')}`);
    }

    // Rule learned — any agent that causes a RULES.md update
    // (This would be detected by file watcher, not by agent run result)
  }
}
