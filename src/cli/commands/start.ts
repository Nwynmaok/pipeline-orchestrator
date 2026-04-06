import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../config.js';
import { sendIpcCommand, isDaemonRunning } from '../ipc.js';

export async function startCommand(projectName: string): Promise<void> {
  const config = loadConfig();
  const projectDir = join(config.pipeline.dir, projectName);

  if (existsSync(projectDir)) {
    console.error(`Project directory already exists: ${projectDir}`);
    process.exit(1);
  }

  // Create project directory
  mkdirSync(projectDir, { recursive: true });

  // Write TRACKER.md
  const tracker = `# Pipeline Tracker: ${projectName}
**Created:** ${new Date().toISOString().split('T')[0]}
**Last Updated:** ${new Date().toISOString().split('T')[0]}
**Overall Status:** 🔄 In Progress

## Project Summary
{Add intake notes here}

## Stage Status
| Stage | Agent | Status | Artifacts | Notes |
|-------|-------|--------|-----------|-------|
| Requirements | PM | Not Started | — | — |
| Design | Architect | Not Started | — | — |
| Backend | Backend | Not Started | — | — |
| Frontend | Frontend | Not Started | — | — |
| Review | Reviewer | Not Started | — | — |
| QA | QA | Not Started | — | — |
| Deploy | DevOps | Not Started | — | — |
`;

  writeFileSync(join(projectDir, 'TRACKER.md'), tracker, 'utf-8');

  // Write PHASE.md
  const phase = `# Current Phase: 1

## Scope
{Define phase 1 scope}

## Phase History
- Phase 1: Initial — 🔄 In Progress
`;

  writeFileSync(join(projectDir, 'PHASE.md'), phase, 'utf-8');

  console.log(`Created project: ${projectDir}`);
  console.log('  TRACKER.md — edit to add intake notes');
  console.log('  PHASE.md — phase 1 initialized');

  // Trigger PM if daemon is running
  const running = await isDaemonRunning();
  if (running) {
    console.log('\nKicking PM to pick up new project...');
    const result = await sendIpcCommand({ type: 'kick', agent: 'pm', project: projectName });
    console.log('  PM triggered:', JSON.stringify(result));
  } else {
    console.log('\nDaemon not running — PM will pick up on next cron cycle.');
  }
}
