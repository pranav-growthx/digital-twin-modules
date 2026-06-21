<!-- 🤖 INSTRUCTION BLOCK — DO NOT EDIT
     This README documents the scheduler module for the digital twin.
     It is auto-generated and should not be manually modified.
-->

# Twin Scheduler Module

Adds timed and recurring task execution to your digital twin. One-off reminders, recurring digests, LLM-powered scheduled prompts — all from a simple CLI.

## How It Works

```
User: "remind me to check PRs every weekday at 9am"
  |
  v
[Skill: schedule-task]
  |
  v
schedule.js --cron "0 9 * * 1-5" --prompt "Check my open PRs" --title "PR check"
  |
  v
data/jobs.json  <-- job stored
  |
  v
scheduler.js (polling every 30s)
  |
  v
[Job is due] --> claude -p "Check my open PRs"
  |
  v
[Delivery] --> Console + macOS Notification + Slack (optional)
```

## Fastest Install

```bash
cd node/
npm install
node scheduler.js  # start standalone, or import into your twin
```

## Manual Install

1. **Install dependencies**
   ```bash
   cd node/
   npm install
   ```

2. **Auto-start in your twin**
   Add to your twin's entry point:
   ```javascript
   import { startScheduler } from "./scheduler.js";
   startScheduler();
   ```

3. **Install the skill**
   Copy `.claude/skills/schedule-task/SKILL.md` to your twin's `.claude/skills/schedule-task/` directory.

4. **Configure Slack (optional)**
   ```bash
   cp node/.env.example node/.env
   # Edit .env with your SLACK_BOT_TOKEN and SLACK_CHANNEL
   ```

5. **Add to .gitignore**
   ```
   node/data/jobs.json
   ```

6. **Test it**
   ```bash
   # Create a job that fires in 2 minutes
   node node/schedule.js --at "$(date -v+2M '+%Y-%m-%dT%H:%M:%S')" --message "Hello from scheduler" --title "test"

   # Start the scheduler
   node node/scheduler.js
   ```

## Files

| File | Description |
| --- | --- |
| `node/scheduler.js` | Polling engine — checks jobs every 30s, executes due ones |
| `node/schedule.js` | CLI for creating, listing, and cancelling jobs |
| `node/package.json` | ESM project config with dotenv dependency |
| `node/.env.example` | Environment variable template |
| `node/data/jobs.json` | Runtime job storage (auto-created, gitignored) |
| `node/data/jobs.example.json` | Sample jobs for reference |
| `.claude/skills/schedule-task/SKILL.md` | Skill definition for the twin agent |
| `PLAN_OF_ACTION.md` | Step-by-step integration checklist |
| `guide for implementing scheduler.md` | Full implementation guide with all code |

## CLI Reference

```bash
# Create one-off job with literal message
node schedule.js --at "2026-06-21T17:00:00" --message "Don't forget the call"

# Create one-off job with LLM prompt
node schedule.js --at "2026-06-21T17:00:00" --prompt "Write a reminder" --title "call reminder"

# Create recurring job
node schedule.js --cron "0 9 * * 1-5" --message "Standup in 30 minutes"

# List pending jobs
node schedule.js list

# Cancel a job
node schedule.js cancel <job-id>
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `POLL_MS` | `30000` | Polling interval in milliseconds |
| `TWIN_DIR` | `__dirname` | Working directory for `claude -p` calls |
| `SLACK_BOT_TOKEN` | — | Slack bot token for message delivery |
| `SLACK_CHANNEL` | — | Default Slack channel for delivery |
