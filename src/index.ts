import { loadConfig } from './config.js';
import { Orchestrator } from './orchestrator/orchestrator.js';
import { Scheduler } from './scheduler/scheduler.js';
import { getDefaultSchedules } from './scheduler/schedule-config.js';
import { FileWatcher } from './watcher/file-watcher.js';
import { EventDispatcher } from './watcher/event-dispatcher.js';
import { createServer, type Server } from 'node:net';
import { existsSync, unlinkSync } from 'node:fs';

const IPC_SOCKET = '/tmp/pipeline-orchestrator.sock';

async function main(): Promise<void> {
  console.log('Pipeline Orchestrator starting...');

  // Load config
  const config = loadConfig();
  console.log(`  Mode: ${config.scheduling.mode}`);
  console.log(`  Pipeline dir: ${config.pipeline.dir}`);
  console.log(`  Timezone: ${config.scheduling.timezone}`);

  // Create orchestrator
  const orchestrator = new Orchestrator(config);

  // Set up scheduler
  const scheduler = new Scheduler();
  const schedules = getDefaultSchedules(
    config.scheduling.coordinator.cron,
    config.scheduling.agents.cron,
    config.scheduling.timezone,
  );

  for (const entry of schedules) {
    scheduler.register(entry, (e) => orchestrator.handleCronTick(e));
  }

  // Set up file watcher (event/hybrid modes)
  const eventDispatcher = new EventDispatcher(config.scheduling.eventThrottleMs);
  const watcher = new FileWatcher(
    config.pipeline.dir,
    config.scheduling.mode,
    (filePath, filename, eventType) => {
      // In hybrid mode, only dispatch during active hours
      if (config.scheduling.mode === 'hybrid') {
        const active = EventDispatcher.isActiveHours(
          config.scheduling.activeHours.start,
          config.scheduling.activeHours.end,
          config.scheduling.timezone,
        );
        if (!active) return;
      }

      const requests = eventDispatcher.mapFileEvent(filePath, filename, eventType);
      if (requests.length > 0) {
        console.log(`[watcher] File event: ${filename} (${eventType}) → dispatching ${requests.map(r => r.agent).join(', ')}`);
        orchestrator.handleEventDispatch(requests).catch(err => {
          console.error('[watcher] Dispatch error:', err);
        });
      }
    },
  );

  // Set up IPC server (for CLI communication)
  const ipcServer = createIpcServer(orchestrator, scheduler);

  // Start everything
  scheduler.start();
  watcher.start();

  console.log('Pipeline Orchestrator running. Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('\nShutting down...');
    scheduler.stop();
    watcher.stop();
    ipcServer.close();
    cleanupSocket();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ─── IPC Server ─────────────────────────────────────────────────────────────

function createIpcServer(orchestrator: Orchestrator, scheduler: Scheduler): Server {
  // Clean up stale socket
  cleanupSocket();

  const server = createServer((socket) => {
    let data = '';
    socket.on('data', (chunk) => { data += chunk.toString(); });
    socket.on('end', async () => {
      try {
        const command = JSON.parse(data);
        const response = await handleIpcCommand(command, orchestrator, scheduler);
        socket.write(JSON.stringify(response));
      } catch (err) {
        socket.write(JSON.stringify({ error: String(err) }));
      }
      socket.end();
    });
  });

  server.listen(IPC_SOCKET, () => {
    console.log(`  IPC listening on ${IPC_SOCKET}`);
  });

  return server;
}

function cleanupSocket(): void {
  if (existsSync(IPC_SOCKET)) {
    try { unlinkSync(IPC_SOCKET); } catch { /* ignore */ }
  }
}

interface IpcCommand {
  type: 'kick' | 'cron-list' | 'ping';
  agent?: string;
  project?: string;
}

async function handleIpcCommand(
  command: IpcCommand,
  orchestrator: Orchestrator,
  scheduler: Scheduler,
): Promise<unknown> {
  switch (command.type) {
    case 'ping':
      return { status: 'ok', uptime: process.uptime() };

    case 'kick':
      if (!command.agent) return { error: 'agent is required' };
      await orchestrator.kick(command.agent as any, command.project);
      return { status: 'ok', agent: command.agent, project: command.project ?? 'all' };

    case 'cron-list':
      return { jobs: scheduler.getStatus() };

    default:
      return { error: `Unknown command: ${(command as any).type}` };
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
