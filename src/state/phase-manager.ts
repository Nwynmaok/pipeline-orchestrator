import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PhaseInfo, PhaseHistoryEntry } from '../types.js';

/**
 * Parse a PHASE.md file and extract phase number, scope, and history.
 */
export function parsePhaseFile(projectDir: string): PhaseInfo {
  const phasePath = join(projectDir, 'PHASE.md');
  let content: string;
  try {
    content = readFileSync(phasePath, 'utf-8');
  } catch {
    // No PHASE.md — default to phase 1
    return { current: 1, scope: '', history: [] };
  }

  // Match "# Current Phase: N" or "Current Phase: N" (some files omit the heading marker)
  const phaseMatch = content.match(/^#?\s*Current Phase:\s*(\d+)/m);
  const current = phaseMatch ? parseInt(phaseMatch[1], 10) : 1;

  // Extract scope section
  let scope = '';
  const scopeMatch = content.match(/^## Scope\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/m);
  if (scopeMatch) {
    scope = scopeMatch[1].trim();
  }

  // Extract phase history entries
  const history: PhaseHistoryEntry[] = [];
  const historySection = content.match(/^## Phase History\s*\n([\s\S]*?)(?=\n## |\n---|\n$)/m);
  if (historySection) {
    const lines = historySection[1].split('\n');
    for (const line of lines) {
      const entryMatch = line.match(/^-\s*Phase\s+(\d+):\s*(.+?)\s*—\s*(✅\s*Complete|🔄\s*In Progress)/);
      if (entryMatch) {
        history.push({
          phase: parseInt(entryMatch[1], 10),
          name: entryMatch[2].trim(),
          status: entryMatch[3].includes('Complete') ? 'complete' : 'in-progress',
        });
      }
    }
  }

  return { current, scope, history };
}

/**
 * Write an updated PHASE.md — coordinator only.
 */
export function writePhaseFile(
  projectDir: string,
  newPhase: number,
  newScope: string,
  history: PhaseHistoryEntry[],
): void {
  const historyLines = history
    .map(h => `- Phase ${h.phase}: ${h.name} — ${h.status === 'complete' ? '✅ Complete' : '🔄 In Progress'}`)
    .join('\n');

  const content = `# Current Phase: ${newPhase}

## Scope
${newScope}

## Phase History
${historyLines}
`;

  writeFileSync(join(projectDir, 'PHASE.md'), content, 'utf-8');
}
