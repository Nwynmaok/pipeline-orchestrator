import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../config.js';
import type { RunLogEntry } from '../../types.js';

export function logsCommand(agent: string, options: { lines?: string }): void {
  const config = loadConfig();
  const logPath = join(config.data.dir, 'run-log.jsonl');
  const maxLines = parseInt(options.lines ?? '20', 10);

  if (!existsSync(logPath)) {
    console.log('No run logs found yet.');
    return;
  }

  const content = readFileSync(logPath, 'utf-8');
  const allEntries: RunLogEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as RunLogEntry;
      if (entry.agent === agent) {
        allEntries.push(entry);
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (allEntries.length === 0) {
    console.log(`No logs found for agent: ${agent}`);
    return;
  }

  const entries = allEntries.slice(-maxLines);
  console.log(`Last ${entries.length} runs for ${agent}:\n`);

  for (const entry of entries) {
    const status = entry.error ? '❌' : '✅';
    const tokens = `${entry.tokensIn}+${entry.tokensOut}`;
    const duration = `${(entry.durationMs / 1000).toFixed(1)}s`;
    const artifacts = entry.artifactsWritten.length > 0
      ? entry.artifactsWritten.join(', ')
      : 'none';

    console.log(`  ${status} ${entry.ts}  ${entry.project.padEnd(25)} ${entry.condition.padEnd(20)} ${tokens.padStart(12)} tokens  ${duration.padStart(6)}  → ${artifacts}`);
    if (entry.error) {
      console.log(`     Error: ${entry.error}`);
    }
  }
}
