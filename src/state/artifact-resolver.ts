import type { ArtifactMap, SpecialFiles } from '../types.js';

/**
 * Artifact prefixes and how they map to ArtifactMap keys.
 */
const ARTIFACT_PREFIXES: { key: keyof ArtifactMap; prefix: string }[] = [
  { key: 'prd', prefix: 'prd-' },
  { key: 'stories', prefix: 'stories-' },
  { key: 'tdd', prefix: 'tdd-' },
  { key: 'api', prefix: 'api-' },
  { key: 'implBackend', prefix: 'impl-backend-' },
  { key: 'implFrontend', prefix: 'impl-frontend-' },
  { key: 'review', prefix: 'review-' },
  { key: 'testplan', prefix: 'testplan-' },
  { key: 'bugs', prefix: 'bugs-' },
  { key: 'deploy', prefix: 'deploy-' },
  { key: 'done', prefix: 'done-' },
  { key: 'patch', prefix: 'patch-' },
];

const SPECIAL_PREFIXES: { key: keyof SpecialFiles; prefix: string }[] = [
  { key: 'needsRevisionPrd', prefix: 'needs-revision-prd-' },
  { key: 'needsRevisionTdd', prefix: 'needs-revision-tdd-' },
  { key: 'needsClarification', prefix: 'needs-clarification' },
  { key: 'context', prefix: 'context-' },
  { key: 'handoff', prefix: 'handoff-' },
];

/**
 * Get the expected artifact filename for a given type, slug, and phase.
 * Phase 1 uses flat naming; phase 2+ uses -phaseN suffix.
 */
export function getArtifactName(prefix: string, slug: string, phase: number): string {
  if (phase <= 1) {
    return `${prefix}${slug}.md`;
  }
  return `${prefix}${slug}-phase${phase}.md`;
}

/**
 * Detect the primary artifact slug used in a project directory.
 * The slug in filenames doesn't always match the directory name
 * (e.g. dir=polymarket-tracker, slug=insider-tracker).
 *
 * Uses majority vote across all artifact files.
 */
export function detectSlug(files: string[], dirName: string): string {
  const slugCounts = new Map<string, number>();
  const prefixes = ARTIFACT_PREFIXES.map(e => e.prefix);

  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    for (const prefix of prefixes) {
      if (f.startsWith(prefix)) {
        // Extract slug: remove prefix and strip -phaseN.md or .md suffix
        const rest = f.slice(prefix.length);
        const m = rest.match(/^(.+?)(?:-phase\d+)?\.md$/);
        if (m) {
          const slug = m[1];
          slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
        }
        break;
      }
    }
  }

  if (slugCounts.size === 0) return dirName;

  // Return the most common slug
  let bestSlug = dirName;
  let bestCount = 0;
  for (const [slug, count] of slugCounts) {
    if (count > bestCount) {
      bestSlug = slug;
      bestCount = count;
    }
  }
  return bestSlug;
}

/**
 * Detect ALL slugs used in a project directory.
 * Some projects (like pipeline-quest) use different slugs for different artifacts.
 */
export function detectAllSlugs(files: string[]): string[] {
  const slugs = new Set<string>();
  const prefixes = ARTIFACT_PREFIXES.map(e => e.prefix);

  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    for (const prefix of prefixes) {
      if (f.startsWith(prefix)) {
        const rest = f.slice(prefix.length);
        const m = rest.match(/^(.+?)(?:-phase\d+)?\.md$/);
        if (m) slugs.add(m[1]);
        break;
      }
    }
  }

  return [...slugs];
}

/**
 * Check whether a filename matches an artifact type for the given phase,
 * trying all known slugs for the project.
 */
function matchesPhase(filename: string, prefix: string, slugs: string[], phase: number): boolean {
  for (const slug of slugs) {
    if (phase <= 1) {
      if (filename === `${prefix}${slug}.md` || filename === `${prefix}${slug}-phase1.md`) {
        return true;
      }
    } else {
      if (filename === `${prefix}${slug}-phase${phase}.md`) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Scan a project directory and resolve which artifacts exist for the current phase.
 * Handles projects that use multiple slugs (e.g. pipeline-quest uses both
 * "agent-skill-tracker" and "pipeline-quest" across different artifact types).
 */
export function resolveArtifacts(
  files: string[],
  slugs: string[],
  phase: number,
): { artifacts: ArtifactMap; specialFiles: SpecialFiles } {
  const mdFiles = files.filter(f => f.endsWith('.md'));

  const artifacts: ArtifactMap = emptyArtifactMap();
  const specialFiles: SpecialFiles = emptySpecialFiles();

  for (const entry of ARTIFACT_PREFIXES) {
    const match = mdFiles.find(f => matchesPhase(f, entry.prefix, slugs, phase));
    if (match) {
      artifacts[entry.key] = match;
    }
  }

  for (const entry of SPECIAL_PREFIXES) {
    const match = mdFiles.find(f => f.startsWith(entry.prefix));
    if (match) {
      specialFiles[entry.key] = match;
    }
  }

  return { artifacts, specialFiles };
}

function emptyArtifactMap(): ArtifactMap {
  return {
    prd: null,
    stories: null,
    tdd: null,
    api: null,
    implBackend: null,
    implFrontend: null,
    review: null,
    testplan: null,
    bugs: null,
    deploy: null,
    done: null,
    patch: null,
  };
}

function emptySpecialFiles(): SpecialFiles {
  return {
    needsRevisionPrd: null,
    needsRevisionTdd: null,
    needsClarification: null,
    context: null,
    handoff: null,
  };
}
