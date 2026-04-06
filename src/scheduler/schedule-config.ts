import type { AgentId } from '../types.js';

/**
 * Agent schedule definitions matching the OpenClaw pipeline.
 *
 * Coordinator: even hours — 0, 12, 14, 16, 18, 20, 22 PT
 * All other agents: odd hours — 13, 15, 17, 19, 21, 23 PT
 * Active window: 12 PM – 12 AM Pacific daily
 */

export interface ScheduleEntry {
  id: string;
  agents: AgentId[];
  cron: string;
  timezone: string;
  description: string;
}

export function getDefaultSchedules(
  coordinatorCron: string,
  agentsCron: string,
  timezone: string,
): ScheduleEntry[] {
  return [
    {
      id: 'coordinator-sync',
      agents: ['coordinator'],
      cron: coordinatorCron,
      timezone,
      description: 'Coordinator pipeline sync (even hours)',
    },
    {
      id: 'agent-cycle',
      agents: ['pm', 'architect', 'backend', 'frontend', 'reviewer', 'qa'],
      cron: agentsCron,
      timezone,
      description: 'Agent work cycle (odd hours)',
    },
  ];
}
