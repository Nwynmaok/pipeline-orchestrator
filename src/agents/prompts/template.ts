/**
 * Structure for agent prompt templates.
 * The prompt composer reads these and assembles the full system prompt.
 */
export interface AgentPromptTemplate {
  /** Agent identity and core responsibilities */
  persona: string;
  /** Operational instructions — the cron prompt logic (pre-checks, conditions, output format) */
  operatingInstructions: string;
}
