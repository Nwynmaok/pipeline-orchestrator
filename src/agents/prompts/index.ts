import type { AgentId } from '../../types.js';
import type { AgentPromptTemplate } from './template.js';
import { coordinatorPrompt } from './coordinator.js';
import { pmPrompt } from './pm.js';
import { architectPrompt } from './architect.js';
import { backendPrompt } from './backend.js';
import { frontendPrompt } from './frontend.js';
import { reviewerPrompt } from './reviewer.js';
import { qaPrompt } from './qa.js';
import { devopsPrompt } from './devops.js';

const PROMPTS: Record<AgentId, AgentPromptTemplate> = {
  coordinator: coordinatorPrompt,
  pm: pmPrompt,
  architect: architectPrompt,
  backend: backendPrompt,
  frontend: frontendPrompt,
  reviewer: reviewerPrompt,
  qa: qaPrompt,
  devops: devopsPrompt,
};

export function getPromptTemplate(agent: AgentId): AgentPromptTemplate {
  return PROMPTS[agent];
}
