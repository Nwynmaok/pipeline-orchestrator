import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { PipelineState, ProjectState } from '../types.js';
import { parsePhaseFile } from '../state/phase-manager.js';
import { resolveArtifacts, detectSlug, detectAllSlugs } from '../state/artifact-resolver.js';
import { parseReviewFile, parseBugsFile } from '../state/review-cycle.js';

/**
 * Scan the pipeline directory and build a complete PipelineState snapshot.
 * This is the single source of truth for dispatch decisions — all reads
 * happen here, dispatch logic never touches the filesystem directly.
 */
export function scanPipeline(pipelineDir: string): PipelineState {
  const projects: ProjectState[] = [];

  let entries: string[];
  try {
    entries = readdirSync(pipelineDir);
  } catch (err) {
    throw new Error(`Cannot read pipeline directory: ${pipelineDir}: ${err}`);
  }

  for (const entry of entries) {
    const entryPath = join(pipelineDir, entry);

    // Skip non-directories and files at root level (CONVENTIONS.md, DASHBOARD.md, etc.)
    try {
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const dirName = basename(entryPath);

    // Read all files in the project directory once
    let files: string[];
    try {
      files = readdirSync(entryPath);
    } catch {
      continue;
    }

    const phase = parsePhaseFile(entryPath);

    // Detect slugs — primary slug for identification, all slugs for artifact resolution
    const slug = detectSlug(files, dirName);
    const allSlugs = detectAllSlugs(files);
    // Always include the directory name as a possible slug
    if (!allSlugs.includes(dirName)) allSlugs.push(dirName);

    const { artifacts, specialFiles } = resolveArtifacts(files, allSlugs, phase.current);

    // Parse review and bugs files if they exist
    const review = artifacts.review
      ? parseReviewFile(entryPath, artifacts.review)
      : null;
    const bugs = artifacts.bugs
      ? parseBugsFile(entryPath, artifacts.bugs)
      : null;

    projects.push({
      slug,
      dir: entryPath,
      phase,
      tracker: null,
      artifacts,
      specialFiles,
      review,
      bugs,
    });
  }

  // Sort by slug for deterministic ordering
  projects.sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    projects,
    scannedAt: new Date(),
  };
}
