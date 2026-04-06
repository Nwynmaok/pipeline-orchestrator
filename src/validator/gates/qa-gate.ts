import type { ValidationResult } from '../../types.js';

export function buildQaValidationPrompt(testplanContent: string, prdContent: string): { system: string; user: string } {
  return {
    system: `You are a document validator. Check if the test plan traces back to the PRD's acceptance criteria.
The test plan should reference or cover the key acceptance criteria from the PRD.
Respond with ONLY a JSON object: {"passed": true/false, "coverage": "brief assessment", "feedback": "brief explanation if failed"}`,
    user: `PRD Acceptance Criteria:\n${prdContent}\n\n---\n\nTest Plan to validate:\n${testplanContent}`,
  };
}

export function parseQaValidationResponse(text: string): ValidationResult {
  try {
    const json = JSON.parse(text.trim());
    return {
      gate: 'qa',
      passed: json.passed === true,
      feedback: json.passed ? null : (json.feedback ?? 'Test plan does not adequately trace to PRD acceptance criteria'),
    };
  } catch {
    const passed = text.toLowerCase().includes('"passed": true') || text.toLowerCase().includes('"passed":true');
    return {
      gate: 'qa',
      passed,
      feedback: passed ? null : 'Validation response could not be parsed',
    };
  }
}
