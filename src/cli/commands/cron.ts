import { sendIpcCommand, isDaemonRunning } from '../ipc.js';
import { loadConfig } from '../../config.js';
import { getDefaultSchedules } from '../../scheduler/schedule-config.js';

export async function cronListCommand(): Promise<void> {
  const running = await isDaemonRunning();

  if (running) {
    // Get live status from daemon
    const result = await sendIpcCommand({ type: 'cron-list' }) as { jobs: Array<{
      id: string;
      cron: string;
      description: string;
      lastRun: string | null;
      running: boolean;
    }> };

    console.log('Scheduled Jobs (live):\n');
    for (const job of result.jobs) {
      const status = job.running ? '🔄 running' : '⏳ idle';
      const lastRun = job.lastRun ?? 'never';
      console.log(`  ${job.id}`);
      console.log(`    Schedule:    ${job.cron}`);
      console.log(`    Description: ${job.description}`);
      console.log(`    Status:      ${status}`);
      console.log(`    Last run:    ${lastRun}`);
      console.log('');
    }
  } else {
    // Show configured schedules
    const config = loadConfig();
    const schedules = getDefaultSchedules(
      config.scheduling.coordinator.cron,
      config.scheduling.agents.cron,
      config.scheduling.timezone,
    );

    console.log('Scheduled Jobs (daemon not running):\n');
    for (const entry of schedules) {
      console.log(`  ${entry.id}`);
      console.log(`    Schedule:    ${entry.cron} (${entry.timezone})`);
      console.log(`    Description: ${entry.description}`);
      console.log(`    Agents:      ${entry.agents.join(', ')}`);
      console.log('');
    }
  }
}
