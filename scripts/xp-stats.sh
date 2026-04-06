#!/bin/bash
# Rebuild agent-stats.json from agent-events.jsonl
# Usage: scripts/xp-stats.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

# Try to read pipeline dir from config.yaml
if command -v python3 &>/dev/null && [[ -f "$REPO_DIR/config.yaml" ]]; then
  PIPELINE_DIR=$(python3 -c "
import yaml, sys
with open('$REPO_DIR/config.yaml') as f:
    c = yaml.safe_load(f)
print(c.get('pipeline',{}).get('dir',''))
" 2>/dev/null || echo "")
fi
PIPELINE_DIR="${PIPELINE_DIR:-/Users/wynclaw/.openclaw/shared/pipeline}"
SHARED_DIR="$(dirname "$PIPELINE_DIR")"
EVENTS_FILE="$SHARED_DIR/agent-events.jsonl"
STATS_FILE="$SHARED_DIR/agent-stats.json"

if [[ ! -f "$EVENTS_FILE" ]]; then
  echo "No events file found at $EVENTS_FILE"
  exit 0
fi

# Use python3 to rebuild stats (jq alternative)
python3 << 'PYEOF'
import json, sys, os, math

events_file = os.environ.get("EVENTS_FILE", sys.argv[1] if len(sys.argv) > 1 else "")
stats_file = os.environ.get("STATS_FILE", sys.argv[2] if len(sys.argv) > 2 else "")

# Read events
agents = {}
with open(events_file) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        ev = json.loads(line)
        agent = ev["agent"]
        xp = ev.get("xp", 0)
        event = ev.get("event", "")

        if agent not in agents:
            agents[agent] = {
                "totalXp": 0,
                "level": 1,
                "skills": {},
                "attributes": {"str": 10, "dex": 10, "con": 10, "int": 10, "wis": 10, "cha": 10}
            }

        agents[agent]["totalXp"] += xp

        # Track skill categories
        skill_map = {
            "feature_implemented": "implementation",
            "bug_fixed": "debugging",
            "clean_pass_review": "quality",
            "clean_pass_qa": "testing",
            "rule_learned": "wisdom",
            "blocker_detected_early": "foresight",
            "successful_deploy": "delivery",
        }
        if event in skill_map:
            skill = skill_map[event]
            agents[agent]["skills"][skill] = agents[agent]["skills"].get(skill, 0) + 1

# Calculate levels (100 XP per level, linear)
for agent in agents.values():
    total = agent["totalXp"]
    if total <= 0:
        agent["level"] = 1
    else:
        level = 1
        xp_needed = (level + 1) * 100
        cumulative = 0
        while cumulative + xp_needed <= total:
            cumulative += xp_needed
            level += 1
            xp_needed = (level + 1) * 100
        agent["level"] = level

    # Attribute bonuses based on level
    bonus = agent["level"] - 1
    base = 10
    agent["attributes"]["str"] = base + bonus
    agent["attributes"]["dex"] = base + max(0, bonus - 1)
    agent["attributes"]["con"] = base + bonus
    agent["attributes"]["int"] = base + max(0, bonus - 1)
    agent["attributes"]["wis"] = base + max(0, bonus - 2)
    agent["attributes"]["cha"] = base + max(0, bonus - 2)

with open(stats_file, "w") as f:
    json.dump(agents, f, indent=2)

print(f"Stats rebuilt: {len(agents)} agents written to {stats_file}")
PYEOF
