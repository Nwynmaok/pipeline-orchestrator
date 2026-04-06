import { AGENT_IDS } from '../../types.js';
import { sendIpcCommand } from '../ipc.js';

export async function kickCommand(agent: string, options: { project?: string }): Promise<void> {
  if (!AGENT_IDS.includes(agent as any)) {
    console.error(`Unknown agent: ${agent}`);
    console.error(`Valid agents: ${AGENT_IDS.join(', ')}`);
    process.exit(1);
  }

  try {
    const result = await sendIpcCommand({
      type: 'kick',
      agent,
      project: options.project,
    }) as Record<string, unknown>;

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log(`Kicked ${agent}${options.project ? ` for ${options.project}` : ''}`);
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
}
