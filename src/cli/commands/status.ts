import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../config.js';

export function statusCommand(): void {
  const config = loadConfig();
  const dashboardPath = join(config.pipeline.dir, 'DASHBOARD.md');

  try {
    const content = readFileSync(dashboardPath, 'utf-8');
    console.log(content);
  } catch {
    console.error(`Dashboard not found at ${dashboardPath}`);
    process.exit(1);
  }
}
