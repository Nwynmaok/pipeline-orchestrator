import { createConnection } from 'node:net';

const IPC_SOCKET = '/tmp/pipeline-orchestrator.sock';

/**
 * Send a command to the running daemon via Unix socket IPC.
 * Returns the parsed JSON response.
 */
export function sendIpcCommand(command: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(IPC_SOCKET, () => {
      socket.write(JSON.stringify(command));
      socket.end();
    });

    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString(); });
    socket.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ raw: data });
      }
    });
    socket.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
        reject(new Error('Daemon is not running. Start it with: pm2 start ecosystem.config.js'));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Check if the daemon is running.
 */
export async function isDaemonRunning(): Promise<boolean> {
  try {
    await sendIpcCommand({ type: 'ping' });
    return true;
  } catch {
    return false;
  }
}
