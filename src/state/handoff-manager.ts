import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AgentId, AgentRunResult } from '../types.js';
import type { AgentRunner } from '../agents/agent-runner.js';

/**
 * After an agent completes work, generate a 2-3 sentence summary
 * of what was produced and key decisions made. Uses Haiku to summarize.
 * Writes handoff-{slug}.md for the downstream agent's context.
 */
export async function createHandoff(
  runner: AgentRunner,
  result: AgentRunResult,
  projectDir: string,
): Promise<void> {
  // Skip if no artifacts were written (agent found no work)
  if (result.artifactsWritten.length === 0) return;

  // Skip for coordinator (it writes sync messages, not artifacts for downstream)
  if (result.agent === 'coordinator') return;

  const system = `You are a summarizer. Given an agent's work output, write a 2-3 sentence handoff summary for the next agent in the pipeline. Focus on:
1. What was produced (artifact names)
2. Key decisions or trade-offs made
3. Anything the downstream agent should be aware of

Be concise and factual. No preamble.`;

  const user = `Agent: ${result.agent}
Project: ${result.project}
Artifacts written: ${result.artifactsWritten.join(', ')}
Artifacts deleted: ${result.artifactsDeleted.join(', ') || 'none'}

Agent's output (summarize this):
${truncate(result.response, 3000)}`;

  try {
    const response = await runner.callHaiku(system, user);

    const handoffContent = `# Handoff: ${result.agent} → next agent
**Project:** ${result.project}
**Date:** ${new Date().toISOString()}
**Artifacts:** ${result.artifactsWritten.join(', ')}

## Summary
${response.text.trim()}
`;

    const handoffPath = join(projectDir, `handoff-${result.project}.md`);
    const dir = dirname(handoffPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(handoffPath, handoffContent, 'utf-8');
  } catch (err) {
    // Handoff generation is non-critical — log and continue
    console.warn(`[handoff] Failed to generate handoff for ${result.agent}/${result.project}: ${err}`);
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...[truncated]';
}
