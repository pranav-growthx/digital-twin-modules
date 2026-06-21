# Guide for Implementing the Scheduler Module

You are Claude Code, implementing a scheduler module for a digital twin. This guide contains all the code and instructions needed for a complete implementation.

---

## Overview

The scheduler module adds timed and recurring task execution to a digital twin. It has three main components:

1. **`scheduler.js`** -- A polling engine that checks `data/jobs.json` every 30 seconds, scans `workflows/` for markdown workflows, executes due jobs, and delivers output via console, macOS notifications, and optionally Slack.
2. **`schedule.js`** -- A deterministic CLI for creating, listing, and cancelling jobs. Available as a fallback when MCP tools are not configured.
3. **`scheduler-mcp.js`** -- An MCP server that exposes scheduler operations as tools (`schedule_task`, `list_jobs`, `cancel_job`, `create_workflow`). This is the primary way the agent creates and manages jobs.

All files are ESM modules (`import`/`export`, `"type": "module"`).

---

## File Structure

```
project-root/
  scheduler.js          # Polling engine (auto-startable)
  schedule.js           # Job-creator CLI (fallback)
  scheduler-mcp.js      # MCP server (primary agent interface)
  workflows/            # Markdown workflow definitions
    *.workflow.md
  data/
    jobs.json           # Runtime job storage (gitignored)
  .mcp.json             # MCP server configuration
```

---

## Integration Steps

### 1. Copy files to project root

Copy from the module's `files/` directory:
- `scheduler.js`
- `schedule.js`
- `scheduler-mcp.js`
- `workflows/` (including example files)

### 2. Install dependencies

```bash
npm install dotenv @modelcontextprotocol/sdk zod
```

### 3. Configure the MCP server

Add to `.mcp.json` in the project root:

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

This registers four tools with the agent:

| Tool | Description |
| --- | --- |
| `schedule_task` | Create a one-off or recurring job. Params: `at` (ISO datetime) or `cron` (5-field), plus `message` (literal) or `prompt` (LLM), and optional `title`. |
| `list_jobs` | List all pending jobs with ID, title, schedule, and type. |
| `cancel_job` | Cancel a job by ID. Params: `jobId`. |
| `create_workflow` | Create a `.workflow.md` file. Params: `name`, `cron`, `prompt`, optional `description` and `enabled`. |

### 4. Auto-start the scheduler

In your twin's main entry point (e.g., `core.js` or `main.js`):

```javascript
import { startScheduler } from "./scheduler.js";

// Inside main() or at top-level:
startScheduler();
```

The scheduler polls every 30 seconds by default. Customize with `POLL_MS` env var or the `pollMs` option.

### 5. (Optional) Install the skill

Copy `skills/schedule-task/SKILL.md` to your twin's `.claude/skills/schedule-task/` directory. This provides a CLI-based fallback for environments where MCP is not configured. With MCP enabled, the agent will use the tools directly.

### 6. Add to .gitignore

```
# Scheduler runtime data
data/jobs.json
```

### 7. Test

```bash
# Ask the twin:
"remind me to check email in 2 minutes"

# Or test manually via CLI:
node schedule.js --at "$(date -v+2M '+%Y-%m-%dT%H:%M:%S')" --message "Test notification" --title "test"

# Start scheduler standalone to verify:
node scheduler.js
```

---

## How the MCP Server Works

The `scheduler-mcp.js` file is a thin stdio MCP server. It reads and writes `data/jobs.json` directly (no shelling out to `schedule.js`). The agent calls the tools, the MCP server modifies the jobs file, and the already-running `scheduler.js` polling engine picks up the changes on its next tick.

```
Agent  -->  MCP tool call (schedule_task)
              |
              v
        scheduler-mcp.js writes to data/jobs.json
              |
              v
        scheduler.js polls jobs.json every 30s
              |
              v
        Job fires: claude -p (prompt) or literal delivery (message)
              |
              v
        onResult callback (console + notification, or Slack)
```

---

## Cron Expression Reference

| Expression     | Meaning                          |
| -------------- | -------------------------------- |
| `* * * * *`    | Every minute                     |
| `*/5 * * * *`  | Every 5 minutes                  |
| `0 9 * * *`    | Daily at 9:00 AM                 |
| `0 9 * * 1-5`  | Weekdays at 9:00 AM             |
| `30 8 * * 1`   | Mondays at 8:30 AM              |
| `0 */2 * * *`  | Every 2 hours on the hour       |
| `0 9,17 * * *` | At 9:00 AM and 5:00 PM daily    |

Fields: `minute(0-59) hour(0-23) day-of-month(1-31) month(1-12) day-of-week(0-6, 0=Sun)`

---

## Job Lifecycle

1. **Created** -- Agent calls `schedule_task` MCP tool (or `schedule.js` CLI) to write a job to `data/jobs.json` with `status: "pending"`
2. **Due** -- Scheduler detects the job is due (one-off: `now >= runAt`; recurring: cron matches current minute)
3. **Running** -- Concurrency guard prevents overlap; if still running from last tick, skip
4. **Delivered** -- Output sent to console + macOS notification (+ Slack if configured via onResult callback)
5. **Done** -- One-off jobs marked `status: "done"`. Recurring jobs update `lastRun` and stay `"pending"`.
6. **Cancelled** -- `cancel_job` MCP tool (or `schedule.js cancel <id>`) marks job as `status: "cancelled"`, scheduler ignores it.

---

## Delivery

The scheduler doesn't own delivery. It calls an `onResult(title, body)` callback:

- **Default** -- prints to console + macOS notification
- **With Slack module** -- the Slack bot passes its own callback

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
