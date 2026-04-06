import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReviewState, ReviewVerdict, BugsState, BugEntry } from '../types.js';

const VERDICTS: ReviewVerdict[] = [
  'Engineer Response Submitted',
  'Approved with Comments',
  'Changes Requested',
  'Approved',
];

/**
 * Parse a review file and extract the review state.
 * Returns null if the file doesn't exist.
 */
export function parseReviewFile(projectDir: string, filename: string): ReviewState | null {
  let content: string;
  try {
    content = readFileSync(join(projectDir, filename), 'utf-8');
  } catch {
    return null;
  }

  // Find verdict — check longest match first to avoid "Approved" matching "Approved with Comments"
  let verdict: ReviewVerdict = 'Approved';
  for (const v of VERDICTS) {
    if (content.includes(v)) {
      verdict = v;
      break;
    }
  }

  const hasTddIssueFlag = content.includes('⚠️ TDD Issue');
  const hasPrdIssueFlag = content.includes('⚠️ PRD Issue');
  const hasEngineerResponse = content.includes('## Engineer Response');

  // Extract CR identifiers
  const changeRequests: string[] = [];
  const crMatches = content.matchAll(/\b(CR-\d+)\b/g);
  for (const m of crMatches) {
    if (!changeRequests.includes(m[1])) {
      changeRequests.push(m[1]);
    }
  }

  return {
    verdict,
    hasTddIssueFlag,
    hasPrdIssueFlag,
    hasEngineerResponse,
    changeRequests,
  };
}

/**
 * Parse a bugs file and extract bug state.
 * Returns null if the file doesn't exist.
 */
export function parseBugsFile(projectDir: string, filename: string): BugsState | null {
  let content: string;
  try {
    content = readFileSync(join(projectDir, filename), 'utf-8');
  } catch {
    return null;
  }

  const bugs: BugEntry[] = [];

  // Match bug entries — look for BUG-XXX or BUG-XX-NNN patterns
  const bugBlocks = content.split(/(?=###?\s+BUG-)/);
  for (const block of bugBlocks) {
    const idMatch = block.match(/###?\s+(BUG-[\w-]+)/);
    if (!idMatch) continue;

    const id = idMatch[1];
    const status: 'Open' | 'Fixed' = /\bFixed\b/i.test(block) ? 'Fixed' : 'Open';
    const source: 'QA' | 'Coordinator' = block.includes('[Coordinator]') ? 'Coordinator' : 'QA';

    // First line after the heading as description
    const lines = block.split('\n').filter(l => l.trim() && !l.match(/^###?\s/));
    const description = lines[0]?.trim() ?? '';

    bugs.push({ id, description, status, source });
  }

  return {
    bugs,
    allFixed: bugs.length > 0 && bugs.every(b => b.status === 'Fixed'),
  };
}

/**
 * Determine if the review state means the engineer should act.
 * Returns true if Changes Requested AND no blocking flags AND no ERS yet.
 */
export function engineerShouldAct(review: ReviewState): boolean {
  return (
    review.verdict === 'Changes Requested' &&
    !review.hasTddIssueFlag &&
    !review.hasPrdIssueFlag &&
    !review.hasEngineerResponse
  );
}

/**
 * Determine if QA should pick up (review approved, no testplan yet).
 */
export function qaCanProceed(review: ReviewState): boolean {
  return review.verdict === 'Approved' || review.verdict === 'Approved with Comments';
}
