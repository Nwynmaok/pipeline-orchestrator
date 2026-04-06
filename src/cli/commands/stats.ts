import { join } from 'node:path';
import { loadConfig } from '../../config.js';
import { StatsManager } from '../../quest/stats-manager.js';

export function statsCommand(): void {
  const config = loadConfig();
  const eventsFile = join(config.pipeline.dir, '..', 'agent-events.jsonl');
  const statsManager = new StatsManager(join(config.pipeline.dir, '..', 'agent-stats.json'));

  const events = statsManager.loadEvents(eventsFile);
  const stats = statsManager.rebuildFromEvents(events);

  console.log(`Pipeline Quest — ${events.length} XP events\n`);

  // Sort by level descending, then XP
  const sorted = Object.entries(stats).sort((a, b) => {
    if (b[1].level !== a[1].level) return b[1].level - a[1].level;
    return b[1].totalXp - a[1].totalXp;
  });

  for (const [agent, stat] of sorted) {
    const bar = '█'.repeat(Math.min(stat.level, 20)) + '░'.repeat(Math.max(20 - stat.level, 0));
    console.log(`  ${agent.padEnd(12)} Lv.${String(stat.level).padStart(2)} ${bar} ${String(stat.totalXp).padStart(5)} XP`);
    console.log(`  ${''.padEnd(12)} STR:${stat.attributes.str} DEX:${stat.attributes.dex} CON:${stat.attributes.con} INT:${stat.attributes.int} WIS:${stat.attributes.wis} CHA:${stat.attributes.cha}`);
    console.log('');
  }
}
