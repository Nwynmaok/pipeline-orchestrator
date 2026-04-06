import type { ValidationResult } from '../../types.js';

const REQUIRED_SECTIONS = [
  'Problem Statement',
  'Goals',
  'User Stories',
  'Acceptance Criteria',
  'Scope',
];

export function buildPrdValidationPrompt(content: string): { system: string; user: string } {
  return {
    system: `You are a document validator. Check if the PRD contains the required sections.
Required sections: ${REQUIRED_SECTIONS.join(', ')}.
Respond with ONLY a JSON object: {"passed": true/false, "missing": ["section1", ...], "feedback": "brief explanation if failed"}`,
    user: `Validate this PRD:\n\n${content}`,
  };
}

export function parsePrdValidationResponse(text: string): ValidationResult {
  try {
    const json = JSON.parse(text.trim());
    return {
      gate: 'prd',
      passed: json.passed === true,
      feedback: json.passed ? null : (json.feedback ?? `Missing sections: ${json.missing?.join(', ')}`),
    };
  } catch {
    // If Haiku returns non-JSON, try to infer
    const passed = text.toLowerCase().includes('"passed": true') || text.toLowerCase().includes('"passed":true');
    return {
      gate: 'prd',
      passed,
      feedback: passed ? null : 'Validation response could not be parsed',
    };
  }
}
