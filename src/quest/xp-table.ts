import type { XpEventType } from '../types.js';

/**
 * XP values per event type — matches the established table from CONVENTIONS.md.
 */
export const XP_VALUES: Record<XpEventType, number> = {
  clean_pass_review: 25,
  clean_pass_qa: 30,
  bug_found_by_reviewer: -10,
  bug_found_by_qa: -15,
  rule_learned: 15,
  blocker_detected_early: 20,
  successful_deploy: 35,
  feature_implemented: 20,
  bug_fixed: 15,
};

/**
 * XP required per level. Simple linear scaling.
 */
export function xpForLevel(level: number): number {
  return level * 100;
}

/**
 * Calculate level from total XP.
 */
export function levelFromXp(totalXp: number): number {
  if (totalXp <= 0) return 1;
  let level = 1;
  let xpNeeded = xpForLevel(level + 1);
  while (totalXp >= xpNeeded) {
    level++;
    xpNeeded += xpForLevel(level + 1);
  }
  return level;
}
