import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { ConversationTurn } from '../types.js';

/**
 * Manages per-agent per-project conversation history stored as JSONL files.
 * Files live at: {dataDir}/conversations/{agent}/{project}.jsonl
 */
export class ConversationStore {
  constructor(private dataDir: string) {}

  /**
   * Load the last N conversation turns for an agent+project pair.
   */
  loadHistory(agent: string, project: string, maxTurns: number): ConversationTurn[] {
    const filePath = this.getPath(agent, project);
    if (!existsSync(filePath)) return [];

    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());

    const turns: ConversationTurn[] = [];
    for (const line of lines) {
      try {
        turns.push(JSON.parse(line) as ConversationTurn);
      } catch {
        // Skip malformed lines
      }
    }

    // Return last N turns
    return turns.slice(-maxTurns);
  }

  /**
   * Append a conversation turn to the history.
   */
  append(agent: string, project: string, turn: ConversationTurn): void {
    const filePath = this.getPath(agent, project);
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify(turn) + '\n';
    writeFileSync(filePath, line, { flag: 'a' });
  }

  /**
   * Load full history (for debugging / CLI logs command).
   */
  loadFullHistory(agent: string, project: string): ConversationTurn[] {
    return this.loadHistory(agent, project, Infinity);
  }

  private getPath(agent: string, project: string): string {
    return join(this.dataDir, 'conversations', agent, `${project}.jsonl`);
  }
}
