# RULES.md - Learned Principles

_These are battle-tested rules learned from past mistakes and successes. Each rule was earned through experience. Follow them to avoid repeating history._

_Format: Each rule includes when it was learned, what went wrong (or right), and the principle to follow._

## How Rules Work

- When you make a mistake that gets caught by a downstream agent (reviewer, QA, or production), document the lesson here as a new rule.
- When you do something well that prevents a bug or saves time, document that too.
- Before starting any new work, read these rules. They are your accumulated wisdom.
- Each rule earns +15 XP when added to the stats tracker.

## Rules

### RULE-001: Verify actual API response field names — don't trust the interface declaration
**Learned:** 2026-03-22
**Context:** `GammaMarket` declared `closeTime?: string` but the actual Polymarket Gamma API returns `endDate` and `endDateIso`. All signals had `marketCloseTime: null` because we were reading a field that doesn't exist. QA caught it.
**Principle:** When integrating with an external API, always `curl` or inspect a live response to verify field names match the TypeScript interface. Do not assume field names from the TDD or a spec are accurate — treat them as hypotheses until verified against real API output.
**Category:** External API integration

### RULE-002: OpenClaw gateway has no REST endpoint for outbound messages
**Learned:** 2026-03-25
**Context:** `alerting.ts` was posting to `http://localhost:18789/api/message` to send Telegram alerts. That endpoint doesn't exist and returns 404. Investigated the OpenClaw gateway source code — message delivery is handled via an internal WebSocket session protocol, not HTTP. The `/tools/invoke` endpoint exists but the `message` tool requires a live session context to know where to deliver.
**Principle:** Do NOT attempt to send outbound messages via the OpenClaw gateway REST API. It doesn't exist. If a project needs to send Telegram messages directly (not through an agent session), use the Telegram Bot API directly: `POST https://api.telegram.org/bot{TOKEN}/sendMessage`. Requires `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` env vars.
**Category:** OpenClaw integration / alert delivery

### RULE-003: Validate field *presence*, not just empty-string — use strict guards for required body params
**Learned:** 2026-03-27
**Context:** BUG-P3-004 — The `POST /heartbeat` endpoint had a guard that caught `botName === ""` but not a missing `botName` key entirely. A caller omitting the field would fall through to `config.botName` and silently update the wrong bot. The Phase 2 fix was narrowly scoped and missed the `undefined` case.
**Principle:** For any required request body field, use a strict presence + type guard: `if (!req.body.field || typeof req.body.field !== 'string')`. Never rely on `||` fallbacks for required fields — they mask missing-key bugs. Only use `||` defaults for genuinely optional fields with documented defaults.
**Category:** Input validation

### RULE-004: When porting modules across sport pipelines, verify config JSON structure matches all consumers
**Learned:** 2026-03-29
**Context:** BUG-MLS-005/006 — `sharp_accounts.json` was written with an MLB-specific flat structure (`mlb_specific`/`cross_sport` arrays of bare strings) instead of the NBA-compatible tiered format that both `nitter_scraper.py` and `sharp_filter.py` expect (`tracked`/`sharp`/`analytics`/`news` keys with full account objects). Result: zero accounts scraped and all tweets classified as "public" — the pipeline's primary signal source was completely dead.
**Principle:** Before writing any config file for a ported module, read the actual consumer code and check what keys it calls `.get()` on. Do not invent a new format — match the existing contract. When multiple modules consume the same config file, check all of them.
**Category:** Cross-project porting / config contract alignment

### RULE-005: Python inline ternary with `or` — operator precedence swallows left side when condition is false
**Learned:** 2026-03-30
**Context:** CR-002 — C017 detection in `nitter_scraper.py` used `error_code = item.get("errorCode") or item.get("error", {}).get("code") if isinstance(item.get("error"), dict) else None`. Python parses this as `(a or b) if condition else None`, so when `condition` is `False` (error is not a dict), the entire expression is `None` — even when `item.get("errorCode")` has a value. The fix BUG-MLS-011 implemented was completely defeated by this.
**Principle:** Never write `x = (a or b) if condition else fallback` when `a` should be evaluated unconditionally. If you need "check A first, then check B conditionally", always split into two statements:
```python
x = item.get("fieldA")
if not x and isinstance(item.get("nested"), dict):
    x = item["nested"].get("fieldB")
```
Python inline ternary is not a full `if/elif/else` — only use it when the condition guards the *entire* expression uniformly.
**Category:** Python correctness / operator precedence

<!-- 
Template for adding rules:

### RULE-{number}: {Short title}
**Learned:** {date}
**Context:** {What happened — the bug, the miss, or the success}
**Principle:** {The rule to follow going forward}
**Category:** {Which skill this relates to}
-->
