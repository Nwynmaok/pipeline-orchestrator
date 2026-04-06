import type { ValidationResult } from '../../types.js';

const REQUIRED_SECTIONS = [
  'Architecture',
  'Data Model',
  'API Contract',
  'Task Breakdown',
];

export function buildTddValidationPrompt(content: string, prdFilename: string): { system: string; user: string } {
  return {
    system: `You are a document validator. Check if the TDD meets these requirements:
1. References the PRD filename "${prdFilename}" somewhere in the document
2. Contains these sections: ${REQUIRED_SECTIONS.join(', ')}
Respond with ONLY a JSON object: {"passed": true/false, "missing": ["issue1", ...], "feedback": "brief explanation if failed"}`,
    user: `Validate this TDD:\n\n${content}`,
  };
}

export function parseTddValidationResponse(text: string): ValidationResult {
  try {
    const json = JSON.parse(text.trim());
    return {
      gate: 'tdd',
      passed: json.passed === true,
      feedback: json.passed ? null : (json.feedback ?? `Issues: ${json.missing?.join(', ')}`),
    };
  } catch {
    const passed = text.toLowerCase().includes('"passed": true') || text.toLowerCase().includes('"passed":true');
    return {
      gate: 'tdd',
      passed,
      feedback: passed ? null : 'Validation response could not be parsed',
    };
  }
}
