import type { ValidationResult } from '../../types.js';

const VALID_VERDICTS = [
  'Approved',
  'Approved with Comments',
  'Changes Requested',
  'Engineer Response Submitted',
];

export function buildReviewValidationPrompt(content: string): { system: string; user: string } {
  return {
    system: `You are a document validator. Check if the review file contains exactly one of these verdict strings: ${VALID_VERDICTS.join(', ')}.
The verdict should appear as a clear verdict line, not just mentioned in passing.
Respond with ONLY a JSON object: {"passed": true/false, "verdict": "the found verdict or null", "feedback": "brief explanation if failed"}`,
    user: `Validate this review:\n\n${content}`,
  };
}

export function parseReviewValidationResponse(text: string): ValidationResult {
  try {
    const json = JSON.parse(text.trim());
    return {
      gate: 'review',
      passed: json.passed === true,
      feedback: json.passed ? null : (json.feedback ?? 'Review must contain exactly one valid verdict'),
    };
  } catch {
    const passed = text.toLowerCase().includes('"passed": true') || text.toLowerCase().includes('"passed":true');
    return {
      gate: 'review',
      passed,
      feedback: passed ? null : 'Validation response could not be parsed',
    };
  }
}
