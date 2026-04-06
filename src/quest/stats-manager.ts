import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { AgentStatsMap, AgentStat, AgentAttributes, XpEvent } from '../types.js';
import { levelFromXp } from './xp-table.js';

const DEFAULT_ATTRIBUTES: AgentAttributes = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

/**
 * Manages agent-stats.json — reads, updates, and writes Pipeline Quest stats.
 */
export class StatsManager {
  private statsFile: string;

  constructor(statsFile: string) {
    this.statsFile = statsFile;
  }

  /**
   * Load current stats. Returns empty map if file doesn't exist.
   */
  load(): AgentStatsMap {
    if (!existsSync(this.statsFile)) return {};

    try {
      const content = readFileSync(this.statsFile, 'utf-8');
      return JSON.parse(content) as AgentStatsMap;
    } catch {
      return {};
    }
  }

  /**
   * Save stats to disk.
   */
  save(stats: AgentStatsMap): void {
    writeFileSync(this.statsFile, JSON.stringify(stats, null, 2) + '\n', 'utf-8');
  }

  /**
   * Apply an XP event to the stats.
   */
  applyEvent(stats: AgentStatsMap, event: XpEvent): AgentStatsMap {
    const agent = event.agent;

    if (!stats[agent]) {
      stats[agent] = {
        totalXp: 0,
        level: 1,
        skills: {},
        attributes: { ...DEFAULT_ATTRIBUTES },
      };
    }

    const stat = stats[agent];
    stat.totalXp += event.xp;
    if (stat.totalXp < 0) stat.totalXp = 0;
    stat.level = levelFromXp(stat.totalXp);

    // Track event type as a skill
    const skillKey = event.event;
    stat.skills[skillKey] = (stat.skills[skillKey] ?? 0) + 1;

    // Adjust attributes based on event type
    this.adjustAttributes(stat, event);

    return stats;
  }

  /**
   * Rebuild stats from the full event log.
   */
  rebuildFromEvents(events: XpEvent[]): AgentStatsMap {
    let stats: AgentStatsMap = {};
    for (const event of events) {
      stats = this.applyEvent(stats, event);
    }
    return stats;
  }

  /**
   * Read all events from agent-events.jsonl.
   */
  loadEvents(eventsFile: string): XpEvent[] {
    if (!existsSync(eventsFile)) return [];

    const content = readFileSync(eventsFile, 'utf-8');
    const events: XpEvent[] = [];

    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as XpEvent);
      } catch {
        // Skip malformed lines
      }
    }

    return events;
  }

  private adjustAttributes(stat: AgentStat, event: XpEvent): void {
    switch (event.event) {
      case 'feature_implemented':
        stat.attributes.str += 1;
        break;
      case 'clean_pass_review':
        stat.attributes.con += 1;
        break;
      case 'clean_pass_qa':
        stat.attributes.con += 1;
        stat.attributes.wis += 1;
        break;
      case 'bug_found_by_reviewer':
        stat.attributes.con = Math.max(1, stat.attributes.con - 1);
        break;
      case 'bug_found_by_qa':
        stat.attributes.con = Math.max(1, stat.attributes.con - 1);
        break;
      case 'blocker_detected_early':
        stat.attributes.wis += 1;
        break;
      case 'successful_deploy':
        stat.attributes.dex += 1;
        break;
      case 'bug_fixed':
        stat.attributes.str += 1;
        break;
      case 'rule_learned':
        stat.attributes.int += 1;
        break;
    }
  }
}
