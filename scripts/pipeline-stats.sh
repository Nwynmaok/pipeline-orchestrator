#!/bin/bash
# Display Pipeline Quest agent levels and XP
# Usage: scripts/pipeline-stats.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Read pipeline dir from config
if command -v python3 &>/dev/null && [[ -f "$REPO_DIR/config.yaml" ]]; then
  PIPELINE_DIR=$(python3 -c "
import yaml
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
print(c.get('pipeline',{}).get('dir',''))
" 2>/dev/null || echo "")
fi
PIPELINE_DIR="${PIPELINE_DIR:-/Users/wynclaw/.openclaw/shared/pipeline}"
SHARED_DIR="$(dirname "$PIPELINE_DIR")"
STATS_FILE="$SHARED_DIR/agent-stats.json"

if [[ ! -f "$STATS_FILE" ]]; then
  echo "No agent-stats.json found. Run scripts/xp-stats.sh to rebuild."
  exit 0
fi

echo "=== Pipeline Quest - Agent Stats ==="
echo ""

python3 << PYEOF
import json

with open("$STATS_FILE") as f:
    raw = json.load(f)

# Support both formats: {agents: {...}} wrapper or flat {agent: {...}}
if isinstance(raw, dict) and "agents" in raw:
    stats = raw["agents"]
else:
    stats = raw

for agent, data in sorted(stats.items()):
    level = data.get("level", 1)
    xp = data.get("xp", data.get("totalXp", 0))
    xp_to_next = data.get("xpToNext", (level + 1) * 100)

    bar_len = 20
    filled = min(bar_len, int(bar_len * max(0, xp) / max(1, xp + xp_to_next)))
    bar = "#" * filled + "-" * (bar_len - filled)

    agent_class = data.get("class", "")
    attrs = data.get("stats", data.get("attributes", {}))
    skills = data.get("skills", {})

    header = f"  {agent.upper()} (Level {level})"
    if agent_class:
        header += f" - {agent_class}"
    print(header)
    print(f"  XP: {xp} [{bar}] {xp_to_next} to next")
    if attrs:
        attr_str = " | ".join(f"{k.upper()}:{v}" for k, v in sorted(attrs.items()))
        print(f"  {attr_str}")
    if skills:
        skill_str = ", ".join(f"{k}({v.get('rank', v) if isinstance(v, dict) else v})" for k, v in sorted(skills.items()))
        print(f"  Skills: {skill_str}")
    print()
PYEOF
