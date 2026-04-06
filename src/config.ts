import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AgentId, ModelId, SchedulingMode } from './types.js';

// ─── Config shape ───────────────────────────────────────────────────────────

export interface Config {
  anthropic: {
    apiKey: string;
  };
  pipeline: {
    dir: string;
    conventionsFile: string;
  };
  data: {
    dir: string;
    rulesDir: string;
  };
  agents: Record<AgentId, AgentConfigEntry>;
  scheduling: {
    mode: SchedulingMode;
    timezone: string;
    activeHours: { start: number; end: number };
    coordinator: { cron: string };
    agents: { cron: string };
    eventThrottleMs: number;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
  validation: {
    enabled: boolean;
    model: ModelId;
  };
  precheck: {
    enabled: boolean;
    model: ModelId;
  };
}

export interface AgentConfigEntry {
  model: ModelId;
  maxConversationTurns: number;
  timeoutMs: number;
}

// ─── Env var resolution ─────────────────────────────────────────────────────

function resolveEnvVars(value: unknown, strict = false): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (match, name: string) => {
      const envVal = process.env[name];
      if (envVal === undefined) {
        if (strict) throw new Error(`Environment variable ${name} is not set`);
        return match; // Leave placeholder for lazy resolution
      }
      return envVal;
    });
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveEnvVars(v, strict));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveEnvVars(v, strict);
    }
    return result;
  }
  return value;
}

// ─── Validation ─────────────────────────────────────────────────────────────

const VALID_MODELS: ModelId[] = ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'];
const VALID_MODES: SchedulingMode[] = ['cron', 'event', 'hybrid'];

function validateConfig(raw: unknown): Config {
  const cfg = raw as Record<string, unknown>;

  if (!cfg.anthropic || !(cfg.anthropic as Record<string, unknown>).apiKey) {
    throw new Error('config: anthropic.apiKey is required');
  }
  if (!cfg.pipeline || !(cfg.pipeline as Record<string, unknown>).dir) {
    throw new Error('config: pipeline.dir is required');
  }
  if (!cfg.telegram || !(cfg.telegram as Record<string, unknown>).botToken) {
    throw new Error('config: telegram.botToken is required');
  }

  const agentsCfg = cfg.agents as Record<string, AgentConfigEntry> | undefined;
  if (!agentsCfg) {
    throw new Error('config: agents section is required');
  }

  for (const [id, agent] of Object.entries(agentsCfg)) {
    if (!VALID_MODELS.includes(agent.model)) {
      throw new Error(`config: agents.${id}.model must be one of: ${VALID_MODELS.join(', ')}`);
    }
  }

  const sched = cfg.scheduling as Record<string, unknown> | undefined;
  if (sched && !VALID_MODES.includes((sched as { mode: SchedulingMode }).mode)) {
    throw new Error(`config: scheduling.mode must be one of: ${VALID_MODES.join(', ')}`);
  }

  return cfg as unknown as Config;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

let _config: Config | null = null;

export function loadConfig(configPath?: string): Config {
  if (_config) return _config;

  const path = configPath ?? resolve(process.cwd(), 'config.yaml');
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);
  const resolved = resolveEnvVars(parsed);
  _config = validateConfig(resolved);
  return _config;
}

export function getConfig(): Config {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return _config;
}

export function resetConfig(): void {
  _config = null;
}
