import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectState, StaleArtifact } from '../types.js';

/**
 * Compare TDD modification time against impl files.
 * If TDD is newer than an impl file, that impl is stale.
 */
export function detectStaleness(project: ProjectState): StaleArtifact[] {
  const stale: StaleArtifact[] = [];

  if (!project.artifacts.tdd) return stale;

  const tddPath = join(project.dir, project.artifacts.tdd);
  const tddMtime = getMtime(tddPath);
  if (!tddMtime) return stale;

  const implFiles = [project.artifacts.implBackend, project.artifacts.implFrontend];

  for (const implFile of implFiles) {
    if (!implFile) continue;
    const implPath = join(project.dir, implFile);
    const implMtime = getMtime(implPath);
    if (!implMtime) continue;

    if (tddMtime > implMtime) {
      stale.push({
        project: project.slug,
        tddFile: project.artifacts.tdd,
        tddMtime,
        implFile,
        implMtime,
      });
    }
  }

  return stale;
}

function getMtime(path: string): Date | null {
  try {
    return statSync(path).mtime;
  } catch {
    return null;
  }
}
