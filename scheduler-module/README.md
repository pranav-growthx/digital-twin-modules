# Twin Scheduler Module

> ## 🤖 If you are Claude Code or Codex (any coding agent), read this first
>
> **Ready-made — don't rebuild anything.** Just install/wire in the files as
> described and the bot gains the capability.
>
> The user pasted this repo because they want their AI agent to **schedule
> messages and tasks** — e.g. "send me a hi message at 2:30pm tomorrow" or
> "remind me every weekday at 9am". Do this:
>
> 1. **Follow `PLAN_OF_ACTION.md`** — the ordered execution checklist.
> 2. **Follow the guide** for full code:
>    - `guide for implementing scheduler.md`
> 3. It installs a `schedule-task` skill + a scheduler engine + markdown
>    workflow support. Voice stays the user's `CLAUDE.md` / `PERSONA.md`.
>
> Everything below is human-facing context.

---

Adds timed and recurring task execution to your digital twin. **Two ways to define jobs:**

1. **CLI commands** — "send me a hi at 5pm" → the agent runs `schedule.js` to create a job
2. **Markdown workflows** — write a `.workflow.md` file, the scheduler picks it up automatically

## How It Works

```
                    ┌──────────────────────────────┐
                    │         TWO SOURCES           │
                    ├──────────────┬────────────────┤
                    │              │                │
              data/jobs.json    workflows/*.workflow.md
              (CLI-created)     (markdown-defined)
                    │              │                
                    └──────┬───────┘
                           ▼
                    scheduler.js (polls every 30s)
                           │
                      [Job is due?]
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              prompt job     message job
           (claude -p)      (literal text)
                    │             │
                    └──────┬──────┘
                           ▼
                    onResult callback
             (console + notification by default,
              Slack module provides its own)
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

That's it. The scheduler watches the `workflows/` directory and picks up new or changed
files automatically — no restart needed. The body of the file is the prompt sent to
`claude -p` when the cron fires.

## CLI Jobs

For one-off tasks and agent-created schedules:

```bash
# One-off with literal message
node schedule.js --at "2026-06-21T17:00:00" --message "Don't forget the call"

# One-off with LLM prompt (runs claude -p → in-voice output)
node schedule.js --at "2026-06-21T17:00:00" --prompt "Write a reminder" --title "call reminder"

# Recurring
node schedule.js --cron "0 9 * * 1-5" --message "Standup in 30 minutes"

# List / cancel
node schedule.js list
node schedule.js cancel <job-id>
```

## Delivery

The scheduler doesn't own delivery. It calls an `onResult(title, body)` callback:

- **Default** — prints to console + macOS notification
- **With Slack module** — the Slack bot passes its own callback to route output to a channel

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

1. Copy `scheduler.js`, `schedule.js`, and `workflows/` to your project root
2. `npm install dotenv`
3. Wire into your twin's startup:
   ```javascript
   import { startScheduler } from "./scheduler.js";
   startScheduler();
   ```
4. Copy `.claude/skills/schedule-task/SKILL.md` to your `.claude/skills/`
5. Add `data/jobs.json` to `.gitignore`
6. Test: "send me a hi message in 2 minutes"

## Files

| File | Description |
| --- | --- |
| `node/scheduler.js` | Engine — polls jobs.json + watches workflows/, fires due jobs |
| `node/schedule.js` | CLI for creating, listing, and cancelling jobs |
| `node/workflows/*.workflow.md.example` | Example markdown workflow definitions |
| `node/package.json` | ESM project with dotenv dependency |
| `node/.env.example` | Environment variable template |
| `node/data/jobs.example.json` | Sample jobs for reference |
| `.claude/skills/schedule-task/SKILL.md` | Skill: teaches the agent to schedule via CLI |
| `PLAN_OF_ACTION.md` | Step-by-step integration checklist |
| `guide for implementing scheduler.md` | Full implementation guide |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `POLL_MS` | `30000` | Polling interval in milliseconds |
| `TWIN_DIR` | `__dirname` | Working directory for `claude -p` calls |
