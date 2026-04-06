import type { AgentId, DispatchDecision, DispatchRequest } from '../types.js';
import type { Config } from '../config.js';
import type { ScheduleEntry } from '../scheduler/schedule-config.js';
import { scanPipeline } from './pipeline-scanner.js';
import { dispatch } from './dispatcher.js';
import { AgentRunner } from '../agents/agent-runner.js';
import { preCheck } from '../validator/pre-check.js';
import { validateArtifact, getGateForArtifact } from '../validator/validator.js';
import { createHandoff } from '../state/handoff-manager.js';
import { TelegramClient } from '../telegram/telegram.js';
import { XpTracker } from '../quest/xp-tracker.js';
import { StatsManager } from '../quest/stats-manager.js';
import { join } from 'node:path';

/**
 * The top-level orchestrator that ties together scanning, dispatch,
 * pre-checks, agent execution, validation, handoffs, Telegram, and XP.
 */
export class Orchestrator {
  private runner: AgentRunner;
  private config: Config;
  private queue: DispatchRequest[] = [];
  private processing = false;
  private telegram: TelegramClient;
  private xpTracker: XpTracker;
  private statsManager: StatsManager;

  constructor(config: Config) {
    this.config = config;
    this.runner = new AgentRunner(config);
    this.telegram = new TelegramClient(config.telegram.botToken, config.telegram.chatId);
    this.xpTracker = new XpTracker(
      join(config.pipeline.dir, '..', 'agent-events.jsonl'),
    );
    this.statsManager = new StatsManager(
      join(config.pipeline.dir, '..', 'agent-stats.json'),
    );
  }

  /**
   * Handle a cron tick — scan pipeline, dispatch agents with work.
   * Called by the scheduler for both coordinator and agent cycle entries.
   */
  async handleCronTick(entry: ScheduleEntry): Promise<void> {
    console.log(`[orchestrator] Cron tick: ${entry.id} (agents: ${entry.agents.join(', ')})`);

    const state = scanPipeline(this.config.pipeline.dir);
    const decisions = dispatch(state);

    // Filter to only agents in this schedule entry
    const relevantDecisions = decisions.filter(d => entry.agents.includes(d.agent));

    // Coordinator always runs on its schedule (it's not dispatch-driven)
    if (entry.agents.includes('coordinator')) {
      await this.runCoordinator();
    }

    // Queue non-coordinator decisions
    for (const decision of relevantDecisions) {
      if (decision.agent === 'coordinator') continue;
      this.enqueue({
        agent: decision.agent,
        project: decision.project,
        trigger: 'cron',
        condition: decision.condition,
        priority: decision.priority,
        enqueuedAt: new Date(),
      });
    }

    await this.processQueue();
  }

  /**
   * Handle an event-driven dispatch request (from file watcher).
   */
  async handleEventDispatch(requests: DispatchRequest[]): Promise<void> {
    for (const request of requests) {
      this.enqueue(request);
    }
    await this.processQueue();
  }

  /**
   * Manually kick an agent for a specific project (from CLI).
   */
  async kick(agent: AgentId, projectSlug?: string): Promise<void> {
    console.log(`[orchestrator] Manual kick: ${agent}${projectSlug ? ` for ${projectSlug}` : ''}`);

    const state = scanPipeline(this.config.pipeline.dir);
    const decisions = dispatch(state).filter(d => d.agent === agent);

    if (projectSlug) {
      const filtered = decisions.filter(d => d.project === projectSlug);
      if (filtered.length === 0) {
        console.log(`[orchestrator] No work found for ${agent} on ${projectSlug}`);
        return;
      }
      for (const d of filtered) {
        this.enqueue({ ...d, trigger: 'kick', enqueuedAt: new Date() });
      }
    } else {
      if (decisions.length === 0) {
        console.log(`[orchestrator] No work found for ${agent}`);
        return;
      }
      for (const d of decisions) {
        this.enqueue({ ...d, trigger: 'kick', enqueuedAt: new Date() });
      }
    }

    await this.processQueue();
  }

  /**
   * Run the coordinator sync (always runs on its cron schedule).
   */
  private async runCoordinator(): Promise<void> {
    const state = scanPipeline(this.config.pipeline.dir);

    // Build a minimal project state for the coordinator
    // The coordinator sees all projects — we pass the first one as a placeholder
    // since the coordinator prompt handles multi-project internally
    if (state.projects.length === 0) {
      console.log('[orchestrator] No projects found — skipping coordinator sync');
      return;
    }

    console.log(`[orchestrator] Running coordinator sync (${state.projects.length} projects)`);

    const result = await this.runner.run({
      agent: 'coordinator',
      project: state.projects[0], // Coordinator uses composeCoordinatorPrompt internally
      condition: 'coordinator-sync',
    });

    if (result.error) {
      console.error(`[orchestrator] Coordinator error: ${result.error}`);
    } else {
      console.log(`[orchestrator] Coordinator sync complete (${result.tokensIn}+${result.tokensOut} tokens, ${result.durationMs}ms)`);

      // Deliver sync message to Telegram
      if (result.response) {
        try {
          await this.telegram.sendLongMessage(result.response);
          console.log('[orchestrator] Sync message delivered to Telegram');
        } catch (err) {
          console.error('[orchestrator] Telegram delivery failed:', err);
        }
      }
    }
  }

  // ─── Queue Processing ──────────────────────────────────────────────────────

  private enqueue(request: DispatchRequest): void {
    // Deduplicate: don't enqueue if same agent+project+condition is already queued
    const isDuplicate = this.queue.some(
      q => q.agent === request.agent && q.project === request.project && q.condition === request.condition,
    );
    if (isDuplicate) return;

    this.queue.push(request);
    // Sort by priority descending
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return; // Prevent concurrent processing
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const request = this.queue.shift()!;
        await this.executeRequest(request);
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeRequest(request: DispatchRequest): Promise<void> {
    const { agent, project: projectSlug, condition, trigger } = request;

    // Re-scan to get fresh state (previous agent may have written files)
    const state = scanPipeline(this.config.pipeline.dir);
    const project = state.projects.find(p => p.slug === projectSlug);

    if (!project) {
      console.warn(`[orchestrator] Project ${projectSlug} not found — skipping`);
      return;
    }

    console.log(`[orchestrator] Executing: ${agent} → ${projectSlug} (${condition}, trigger=${trigger})`);

    // Pre-check (Haiku) — skip if disabled
    if (this.config.precheck.enabled) {
      const shouldRun = await preCheck(this.runner, request as DispatchDecision, project);
      if (!shouldRun) {
        console.log(`[orchestrator] Pre-check: ${agent} has no real work for ${projectSlug} — skipping`);
        return;
      }
    }

    // Run the agent
    const result = await this.runner.run({ agent, project, condition });

    if (result.error) {
      console.error(`[orchestrator] ${agent} error on ${projectSlug}: ${result.error}`);
      return;
    }

    console.log(
      `[orchestrator] ${agent} complete: ${result.artifactsWritten.length} written, ` +
      `${result.artifactsDeleted.length} deleted (${result.tokensIn}+${result.tokensOut} tokens, ${result.durationMs}ms)`,
    );

    // Validate output artifacts (Haiku)
    if (this.config.validation.enabled) {
      for (const artifact of result.artifactsWritten) {
        const gate = getGateForArtifact(artifact);
        if (!gate) continue;

        // Re-scan after writes to get updated project state
        const freshState = scanPipeline(this.config.pipeline.dir);
        const freshProject = freshState.projects.find(p => p.slug === projectSlug);
        if (!freshProject) continue;

        const validation = await validateArtifact(this.runner, freshProject, gate);
        if (!validation.passed) {
          console.warn(`[orchestrator] Validation failed for ${artifact}: ${validation.feedback}`);
          // TODO: Write context-{slug}.md with feedback and route back to owning agent
        } else {
          console.log(`[orchestrator] Validation passed for ${artifact}`);
        }
      }
    }

    // Generate handoff summary (Haiku)
    if (result.artifactsWritten.length > 0) {
      await createHandoff(this.runner, result, project.dir);
    }

    // Log XP events
    if (result.artifactsWritten.length > 0 || result.artifactsDeleted.length > 0) {
      try {
        this.xpTracker.logForRun({
          agent,
          project: projectSlug,
          artifactsWritten: result.artifactsWritten,
          artifactsDeleted: result.artifactsDeleted,
        });

        // Update stats
        const events = this.statsManager.loadEvents(
          join(this.config.pipeline.dir, '..', 'agent-events.jsonl'),
        );
        const stats = this.statsManager.rebuildFromEvents(events);
        this.statsManager.save(stats);
      } catch (err) {
        console.warn('[orchestrator] XP tracking error:', err);
      }
    }
  }

  /**
   * Get the AgentRunner instance (for CLI commands that need Haiku calls).
   */
  getRunner(): AgentRunner {
    return this.runner;
  }
}
