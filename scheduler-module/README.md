# Twin Scheduler Module

> ## If you are Claude Code or Codex (any coding agent), read this first
>
> **Ready-made -- don't rebuild anything.** Just install/wire in the files as
> described and the bot gains the capability.
>
> The user pasted this repo because they want their AI agent to **schedule
> messages and tasks** -- e.g. "send me a hi message at 2:30pm tomorrow" or
> "remind me every weekday at 9am". Do this:
>
> 1. **Follow `PLAN_OF_ACTION.md`** -- the ordered execution checklist.
> 2. **Follow the guide** for full code:
>    - `guide for implementing scheduler.md`
> 3. It installs an MCP server (primary) + an optional skill fallback + a
>    scheduler engine + markdown workflow support.
>
> Everything below is human-facing context.

---

Adds timed and recurring task execution to your digital twin. **Three ways to define jobs:**

1. **MCP tools** (primary) -- the agent calls `schedule_task` via the MCP server
2. **CLI commands** -- `schedule.js` for manual or Bash-based job creation
3. **Markdown workflows** -- write a `.workflow.md` file, the scheduler picks it up automatically

## How It Works

```
                    +------------------------------+
                    |         THREE SOURCES         |
                    +----------+----------+--------+
                    |          |          |         |
              MCP tools   schedule.js   workflows/*.workflow.md
              (agent)     (CLI)         (markdown-defined)
                    |          |          |
                    +-----+----+----+-----+
                          |         |
                    data/jobs.json  (hot-reloaded)
                          |
                    scheduler.js (polls every 30s)
                          |
                     [Job is due?]
                          |
                    +-----+------+
                    |            |
              prompt job   message job
           (claude -p)    (literal text)
                    |            |
                    +-----+------+
                          |
                    onResult callback
             (console + notification by default,
              Slack module provides its own)
```

## MCP Server (Primary Integration)

The scheduler exposes four MCP tools via `scheduler-mcp.js`:

| Tool | Description |
| --- | --- |
| `schedule_task` | Create a one-off (`at`) or recurring (`cron`) task |
| `list_jobs` | List all pending scheduled jobs |
| `cancel_job` | Cancel a job by ID |
| `create_workflow` | Create a `.workflow.md` file |

### Configure in `.mcp.json`

```json
{
  "mcpServers": {
    "scheduler": {
      "command": "node",
      "args": ["scheduler-mcp.js"]
    }
  }
}
```

## Markdown Workflows

The easiest way to define a recurring job. Create a `.workflow.md` file in `workflows/`:

```markdown
---
name: daily-digest
enabled: true
description: Morning summary of email + Slack
cron: "0 9 * * 1-5"
---

You are my digital twin. Read my unread emails and Slack messages
from the last 12 hours. Write a short morning briefing:
- What needs my attention today
- Key messages I should reply to
- Any deadlines or meetings coming up

Keep it under 10 bullet points. Be direct.
```

The scheduler watches the `workflows/` directory and picks up new or changed files automatically -- no restart needed.

## CLI Jobs

For manual or Bash-based job creation:

```bash
# One-off with literal message
node schedule.js --at "2026-06-21T17:00:00" --message "Don't forget the call"

# One-off with LLM prompt
node schedule.js --at "2026-06-21T17:00:00" --prompt "Write a reminder" --title "call reminder"

# Recurring
node schedule.js --cron "0 9 * * 1-5" --message "Standup in 30 minutes"

# List / cancel
node schedule.js list
node schedule.js cancel <job-id>
```

## Delivery

The scheduler calls an `onResult(title, body)` callback:

- **Default** -- prints to console + macOS notification
- **With Slack module** -- the Slack bot passes its own callback to route output to a channel

```javascript
import { startScheduler } from "./scheduler.js";

// Default: console + notification
startScheduler();

// With Slack: pass a custom callback
startScheduler({
  onResult: (title, body) => {
    slackClient.chat.postMessage({ channel: "#general", text: `*${title}*\n${body}` });
  }
});
```

## Install

1. Copy `scheduler.js`, `schedule.js`, `scheduler-mcp.js`, and `workflows/` from `files/` to your project root
2. `npm install dotenv @modelcontextprotocol/sdk zod`
3. Add to `.mcp.json`:
   ```json
   { "mcpServers": { "scheduler": { "command": "node", "args": ["scheduler-mcp.js"] } } }
   ```
4. Wire into your twin's startup:
   ```javascript
   import { startScheduler } from "./scheduler.js";
   startScheduler();
   ```
5. (Optional) Copy `skills/schedule-task/SKILL.md` to `.claude/skills/` as a CLI fallback
6. Add `data/jobs.json` to `.gitignore`
7. Test: "send me a hi message in 2 minutes"

## Files

| File | Description |
| --- | --- |
| `files/scheduler.js` | Engine -- polls jobs.json + watches workflows/, fires due jobs |
| `files/schedule.js` | CLI for creating, listing, and cancelling jobs |
| `files/scheduler-mcp.js` | MCP server -- exposes scheduler as tools for the agent |
| `files/workflows/*.workflow.md.example` | Example markdown workflow definitions |
| `skills/schedule-task/SKILL.md` | Optional skill: teaches the agent to schedule via CLI (fallback) |
| `deps.txt` | npm dependencies to install |
| `PLAN_OF_ACTION.md` | Step-by-step integration checklist |
| `guide for implementing scheduler.md` | Full implementation guide |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `POLL_MS` | `30000` | Polling interval in milliseconds |
| `TWIN_DIR` | `__dirname` | Working directory for `claude -p` calls |
