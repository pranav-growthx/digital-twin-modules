---
name: schedule-task
description: >
  Schedule a future or recurring message/task for the user
  (e.g. "send me a hi message at 2:30pm tomorrow", "remind me every weekday at 9am").
  Trigger whenever the user asks to schedule, remind, or send something at a later time
  or on a repeating schedule.
---

# Schedule a Task

Follow these steps exactly. Do NOT hand-edit `data/jobs.json`.

## 1. Get the current time

```bash
date "+%Y-%m-%dT%H:%M:%S"
```

## 2. Work out the target time

- **"at 7:30pm"** or **"at 19:30"** — use today's date if that time is still in the future, otherwise use tomorrow. Format: `YYYY-MM-DDTHH:MM:SS`
- **"in 10 minutes"** — add the offset to the current time from step 1.
- **"in 2 hours"** — add the offset to the current time from step 1.
- **"tomorrow at 9am"** — next day, `T09:00:00`.
- **"every weekday at 9am"** — cron: `0 9 * * 1-5`
- **"every hour"** — cron: `0 * * * *`
- **"every 30 minutes"** — cron: `*/30 * * * *`
- **"every day at 6pm"** — cron: `0 18 * * *`

For cron, use standard 5-field format: `minute hour day-of-month month day-of-week`.

## 3. Create the job

Determine whether the user wants a literal message or an LLM-generated response:
- Use `--message` for exact text the user wants delivered as-is.
- Use `--prompt` when the user wants the twin to generate/compose something.

Pick a short `--title` summarizing the task.

Run **one** of:

```bash
# One-off job with literal message
node /path/to/scheduler-module/node/schedule.js --at "YYYY-MM-DDTHH:MM:SS" --message "the message" --title "short title"

# One-off job with LLM prompt
node /path/to/scheduler-module/node/schedule.js --at "YYYY-MM-DDTHH:MM:SS" --prompt "the prompt" --title "short title"

# Recurring job with literal message
node /path/to/scheduler-module/node/schedule.js --cron "M H DOM MON DOW" --message "the message" --title "short title"

# Recurring job with LLM prompt
node /path/to/scheduler-module/node/schedule.js --cron "M H DOM MON DOW" --prompt "the prompt" --title "short title"
```

Replace `/path/to/scheduler-module` with the actual path to the scheduler module.

## 4. Confirm

Tell the user what was scheduled, including:
- The job ID (printed by the CLI)
- When it will run (human-readable)
- What it will do

The scheduler is already running inside the twin -- it will pick up the job automatically.

## Listing and cancelling

```bash
# Show all pending jobs
node /path/to/scheduler-module/node/schedule.js list

# Cancel a job
node /path/to/scheduler-module/node/schedule.js cancel <job-id>
```
