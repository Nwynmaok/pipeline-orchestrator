import { watch, type FSWatcher } from 'chokidar';
import { basename } from 'node:path';
import type { SchedulingMode } from '../types.js';

export type FileEventCallback = (filePath: string, filename: string, eventType: 'add' | 'change') => void;

/**
 * Watches the pipeline directory for file changes using chokidar.
 * Only active in 'event' or 'hybrid' scheduling modes.
 */
export class FileWatcher {
  private watcher: FSWatcher | null = null;

  constructor(
    private pipelineDir: string,
    private mode: SchedulingMode,
    private onFileEvent: FileEventCallback,
  ) {}

  start(): void {
    if (this.mode === 'cron') {
      console.log('[watcher] Skipping file watcher — cron-only mode');
      return;
    }

    this.watcher = watch(this.pipelineDir, {
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500,
      },
      ignored: [
        /(^|[/\\])\./,
        /node_modules/,
        /\.json$/,
        /\.jsonl$/,
      ],
    });

    this.watcher.on('add', (path: string) => {
      const filename = basename(path);
      if (filename.endsWith('.md')) {
        this.onFileEvent(path, filename, 'add');
      }
    });

    this.watcher.on('change', (path: string) => {
      const filename = basename(path);
      if (filename.endsWith('.md')) {
        this.onFileEvent(path, filename, 'change');
      }
    });

    console.log(`[watcher] Watching ${this.pipelineDir} for file changes`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[watcher] File watcher stopped');
    }
  }
}
