#!/usr/bin/env node

import { Command } from 'commander';
import { statusCommand } from './commands/status.js';
import { startCommand } from './commands/start.js';
import { kickCommand } from './commands/kick.js';
import { statsCommand } from './commands/stats.js';
import { logsCommand } from './commands/logs.js';
import { cronListCommand } from './commands/cron.js';

const program = new Command();

program
  .name('pipeline')
  .description('Pipeline Orchestrator CLI')
  .version('1.0.0');

program
  .command('status')
  .description('Show pipeline dashboard')
  .action(statusCommand);

program
  .command('start <project-name>')
  .description('Create a new project and trigger PM')
  .action(startCommand);

program
  .command('kick <agent>')
  .description('Manually trigger an agent run')
  .option('-p, --project <slug>', 'Target a specific project')
  .action(kickCommand);

program
  .command('stats')
  .description('Show Pipeline Quest agent levels and XP')
  .action(statsCommand);

program
  .command('logs <agent>')
  .description('Show recent run history for an agent')
  .option('-n, --lines <count>', 'Number of log entries to show', '20')
  .action(logsCommand);

program
  .command('cron')
  .description('Show scheduled cron jobs')
  .command('list')
  .description('List all scheduled jobs and their status')
  .action(cronListCommand);

program.parse();
