# Digital Twin Modules

Plug-and-play modules for building personal AI agents (digital twins). Each module adds a capability to your twin — paste a link into Claude Code, the agent installs it, done.

Built for the GrowthX Digital Twin Buildathon. Derived from [Junior](https://github.com/psbakre/junior), our production agent.

## Modules

| Module | What it adds | Install |
|--------|-------------|---------|
| **[Slack](./slack-module/)** | Put your twin on Slack — DMs, mentions, thread replies | Paste repo link into Claude Code |
| **[Memory](./memory-module/)** | Long-term recall — SQLite + full-text search, auto-capture | Paste repo link into Claude Code |
| **[Scheduler](./scheduler-module/)** | Timed & recurring tasks — "remind me at 5pm" | Paste repo link into Claude Code |
| **[Capabilities](./capabilities-module/)** | Email, calendar, web search via MCP tools | Paste repo link into Claude Code |

## Prerequisites

You need a working twin core first — a `core.js` with these exported functions:

```javascript
export function askTwin(message)      // calls claude -p, returns reply
export function recallContext(query)  // returns past context or ""
export function remember(content)     // saves content for future recall
```

Build this in the **Building Phase** of the buildathon (iterations 0-2 in BUILDING.md).

## How modules work

Every module follows the same install pattern:

1. Paste the module's repo link into Claude Code
2. Claude reads `PLAN_OF_ACTION.md` and follows it step by step
3. It installs deps, copies code, wires into your twin, walks you through manual steps
4. Verifies it works end-to-end

Modules hook into the extension points your core exports — `askTwin()` for the brain, `recallContext()`/`remember()` for memory, `main()` for startup.

## Build your own

Each module has a clear interface. Don't like ours? Swap in your own implementation:

- **Platform** — anything that calls `askTwin()` when a message arrives
- **Memory** — anything that implements `recallContext(query)` and `remember(content)`
- **Scheduler** — anything that fires `askTwin()` on a timer
- **Capabilities** — any MCP server added via `claude mcp add`
