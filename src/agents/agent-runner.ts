import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, unlinkSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AgentId,
  AgentRunParams,
  AgentRunResult,
  ProjectState,
  ParsedAgentResponse,
  FileWriteOp,
  FileDeleteOp,
  RunLogEntry,
  ConversationTurn,
  ModelId,
} from '../types.js';
import type { Config } from '../config.js';
import { composeSystemPrompt, composeCoordinatorPrompt } from './prompt-composer.js';
import { ConversationStore } from './conversation-store.js';
import { scanPipeline } from '../orchestrator/pipeline-scanner.js';

// ─── Artifact ownership ────────────────────────────────────────────────────

const ARTIFACT_OWNERSHIP: Record<AgentId, { canWrite: string[]; canDelete: string[] }> = {
  coordinator: {
    canWrite: ['TRACKER.md', 'DASHBOARD.md', 'PHASE.md', 'context-', 'bugs-'],
    canDelete: [],
  },
  pm: {
    canWrite: ['prd-', 'stories-'],
    canDelete: ['needs-revision-prd-'],
  },
  architect: {
    canWrite: ['tdd-', 'api-'],
    canDelete: ['needs-revision-tdd-'],
  },
  backend: {
    canWrite: ['impl-backend-', 'patch-', 'review-', 'bugs-'],
    canDelete: [],
  },
  frontend: {
    canWrite: ['impl-frontend-', 'patch-', 'review-', 'bugs-'],
    canDelete: [],
  },
  reviewer: {
    canWrite: ['review-'],
    canDelete: ['bugs-', 'testplan-'],
  },
  qa: {
    canWrite: ['testplan-', 'bugs-'],
    canDelete: [],
  },
  devops: {
    canWrite: ['deploy-', 'done-'],
    canDelete: [],
  },
};

// Any agent can write needs-clarification.md
const UNIVERSAL_WRITE = ['needs-clarification'];

/**
 * Run a single agent against the Claude API.
 */
export class AgentRunner {
  private client: Anthropic;
  private conversationStore: ConversationStore;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.conversationStore = new ConversationStore(config.data.dir);
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { agent, project, condition } = params;
    const runId = randomUUID();
    const startTime = Date.now();

    const agentConfig = this.config.agents[agent];
    const model = agentConfig.model;

    try {
      // Compose system prompt
      let systemPrompt: string;
      if (agent === 'coordinator') {
        const state = scanPipeline(this.config.pipeline.dir);
        const summaries = state.projects
          .map(p => {
            const artifacts = Object.entries(p.artifacts)
              .filter(([, v]) => v !== null)
              .map(([k]) => k);
            return `${p.slug} (Phase ${p.phase.current}): ${artifacts.join(', ') || 'no artifacts'}`;
          })
          .join('\n');
        systemPrompt = composeCoordinatorPrompt({
          config: this.config,
          projectSummaries: summaries,
        });
      } else {
        systemPrompt = composeSystemPrompt({
          agent,
          project,
          condition,
          config: this.config,
        });
      }

      // Load conversation history
      const history = this.conversationStore.loadHistory(
        agent,
        project.slug,
        agentConfig.maxConversationTurns,
      );

      // Build messages array
      const messages: Anthropic.MessageParam[] = history.map(turn => ({
        role: turn.role,
        content: turn.content,
      }));

      // Add the current user message (trigger)
      const userMessage = buildUserMessage(agent, project, condition);
      messages.push({ role: 'user', content: userMessage });

      // Call Claude API
      const response = await this.client.messages.create({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages,
      });

      const responseText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n');

      const tokensIn = response.usage.input_tokens;
      const tokensOut = response.usage.output_tokens;
      const durationMs = Date.now() - startTime;

      // Parse file operations from response
      const parsed = parseAgentResponse(responseText);

      // Execute file operations with ownership enforcement
      const { written, deleted } = this.executeFileOps(agent, project.dir, parsed);

      // Save conversation turns
      this.conversationStore.append(agent, project.slug, {
        ts: new Date().toISOString(),
        role: 'user',
        content: userMessage,
        model,
        tokensIn: 0,
        tokensOut: 0,
        runId,
      });
      this.conversationStore.append(agent, project.slug, {
        ts: new Date().toISOString(),
        role: 'assistant',
        content: responseText,
        model,
        tokensIn,
        tokensOut,
        runId,
      });

      // Log run
      this.logRun({
        runId,
        ts: new Date().toISOString(),
        agent,
        project: project.slug,
        trigger: 'cron', // caller overrides if needed
        condition,
        model,
        tokensIn,
        tokensOut,
        durationMs,
        artifactsWritten: written,
        artifactsDeleted: deleted,
        validationPassed: null,
        error: null,
      });

      return {
        runId,
        agent,
        project: project.slug,
        artifactsWritten: written,
        artifactsDeleted: deleted,
        response: responseText,
        tokensIn,
        tokensOut,
        durationMs,
        error: null,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.logRun({
        runId,
        ts: new Date().toISOString(),
        agent,
        project: project.slug,
        trigger: 'cron',
        condition,
        model,
        tokensIn: 0,
        tokensOut: 0,
        durationMs,
        artifactsWritten: [],
        artifactsDeleted: [],
        validationPassed: null,
        error: errorMsg,
      });

      return {
        runId,
        agent,
        project: project.slug,
        artifactsWritten: [],
        artifactsDeleted: [],
        response: '',
        tokensIn: 0,
        tokensOut: 0,
        durationMs,
        error: errorMsg,
      };
    }
  }

  /**
   * Make a lightweight Haiku call (for pre-checks, validation, handoffs).
   */
  async callHaiku(systemPrompt: string, userMessage: string): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    const model: ModelId = this.config.precheck.model;
    const response = await this.client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    return {
      text,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
    };
  }

  // ─── File Operations ───────────────────────────────────────────────────────

  private executeFileOps(
    agent: AgentId,
    projectDir: string,
    parsed: ParsedAgentResponse,
  ): { written: string[]; deleted: string[] } {
    const written: string[] = [];
    const deleted: string[] = [];
    const ownership = ARTIFACT_OWNERSHIP[agent];

    for (const op of parsed.writes) {
      if (!this.canWrite(agent, op.path, ownership)) {
        console.warn(`[${agent}] BLOCKED: cannot write ${op.path} — ownership violation`);
        continue;
      }
      const fullPath = join(projectDir, op.path);
      const dir = dirname(fullPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(fullPath, op.content, 'utf-8');
      written.push(op.path);
    }

    for (const op of parsed.deletes) {
      if (!this.canDelete(agent, op.path, ownership)) {
        console.warn(`[${agent}] BLOCKED: cannot delete ${op.path} — ownership violation`);
        continue;
      }
      const fullPath = join(projectDir, op.path);
      try {
        unlinkSync(fullPath);
        deleted.push(op.path);
      } catch {
        console.warn(`[${agent}] Failed to delete ${op.path} — file may not exist`);
      }
    }

    return { written, deleted };
  }

  private canWrite(agent: AgentId, filename: string, ownership: { canWrite: string[] }): boolean {
    if (UNIVERSAL_WRITE.some(prefix => filename.startsWith(prefix))) return true;
    return ownership.canWrite.some(prefix => filename.startsWith(prefix) || filename === prefix);
  }

  private canDelete(agent: AgentId, filename: string, ownership: { canDelete: string[] }): boolean {
    return ownership.canDelete.some(prefix => filename.startsWith(prefix));
  }

  // ─── Run Log ───────────────────────────────────────────────────────────────

  private logRun(entry: RunLogEntry): void {
    const logPath = join(this.config.data.dir, 'run-log.jsonl');
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(logPath, JSON.stringify(entry) + '\n');
  }
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Parse WRITE_FILE and DELETE_FILE markers from agent response text.
 */
export function parseAgentResponse(text: string): ParsedAgentResponse {
  const writes: FileWriteOp[] = [];
  const deletes: FileDeleteOp[] = [];

  // Match <<<WRITE_FILE: path>>>...<<<END_FILE>>>
  const writePattern = /<<<WRITE_FILE:\s*(.+?)>>>([\s\S]*?)<<<END_FILE>>>/g;
  let match;
  while ((match = writePattern.exec(text)) !== null) {
    const path = match[1].trim();
    // Strip leading/trailing newline from content (but preserve internal formatting)
    const content = match[2].replace(/^\n/, '').replace(/\n$/, '') + '\n';
    writes.push({ path, content });
  }

  // Match <<<DELETE_FILE: path>>>
  const deletePattern = /<<<DELETE_FILE:\s*(.+?)>>>/g;
  while ((match = deletePattern.exec(text)) !== null) {
    const path = match[1].trim();
    // Don't double-count paths that were part of a WRITE_FILE block
    if (!writes.some(w => w.path === path)) {
      deletes.push({ path });
    }
  }

  return { writes, deletes, rawText: text };
}

// ─── User Message Builder ───────────────────────────────────────────────────

function buildUserMessage(
  agent: AgentId,
  project: ProjectState,
  condition: string,
): string {
  const lines = [
    `Trigger: ${condition}`,
    `Project: ${project.slug}`,
    `Phase: ${project.phase.current}`,
    `Directory: ${project.dir}`,
    '',
    'Execute the matching condition from your operating instructions.',
    'Wrap all file operations in <<<WRITE_FILE>>> / <<<DELETE_FILE>>> markers.',
  ];

  // Add condition-specific context
  if (condition === 'review-feedback' && project.review) {
    lines.push('', `Review verdict: ${project.review.verdict}`);
    if (project.review.changeRequests.length > 0) {
      lines.push(`Change requests to address: ${project.review.changeRequests.join(', ')}`);
    }
  }

  if (condition === 'bug-fix' && project.bugs) {
    const open = project.bugs.bugs.filter(b => b.status === 'Open');
    lines.push('', `Open bugs to fix: ${open.map(b => b.id).join(', ')}`);
  }

  return lines.join('\n');
}
