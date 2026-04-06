import { createTask } from 'node-cron';
import type { ScheduleEntry } from './schedule-config.js';

interface CronTask {
  start(): void;
  stop(): void;
}

export interface ScheduledJob {
  entry: ScheduleEntry;
  task: CronTask;
  lastRun: Date | null;
  running: boolean;
}

/**
 * Manages cron jobs for the pipeline.
 */
export class Scheduler {
  private jobs: Map<string, ScheduledJob> = new Map();

  /**
   * Register a schedule entry and its callback.
   */
  register(entry: ScheduleEntry, callback: (entry: ScheduleEntry) => Promise<void>): void {
    if (this.jobs.has(entry.id)) {
      throw new Error(`Schedule ${entry.id} already registered`);
    }

    const job: ScheduledJob = {
      entry,
      task: null!,
      lastRun: null,
      running: false,
    };

    const task = createTask(
      entry.cron,
      async () => {
        if (job.running) {
          console.log(`[scheduler] Skipping ${entry.id} — previous run still active`);
          return;
        }
        job.running = true;
        job.lastRun = new Date();
        console.log(`[scheduler] Running ${entry.id} at ${job.lastRun.toISOString()}`);
        try {
          await callback(entry);
        } catch (err) {
          console.error(`[scheduler] Error in ${entry.id}:`, err);
        } finally {
          job.running = false;
        }
      },
      { timezone: entry.timezone },
    ) as unknown as CronTask;

    job.task = task;
    this.jobs.set(entry.id, job);
  }

  /**
   * Start all registered cron jobs.
   */
  start(): void {
    for (const [id, job] of this.jobs) {
      job.task.start();
      console.log(`[scheduler] Started ${id}: ${job.entry.cron} (${job.entry.timezone})`);
    }
  }

  /**
   * Stop all cron jobs.
   */
  stop(): void {
    for (const [id, job] of this.jobs) {
      job.task.stop();
      console.log(`[scheduler] Stopped ${id}`);
    }
  }

  /**
   * Get status of all scheduled jobs (for CLI).
   */
  getStatus(): { id: string; cron: string; description: string; lastRun: string | null; running: boolean }[] {
    return [...this.jobs.values()].map(job => ({
      id: job.entry.id,
      cron: job.entry.cron,
      description: job.entry.description,
      lastRun: job.lastRun?.toISOString() ?? null,
      running: job.running,
    }));
  }
}
