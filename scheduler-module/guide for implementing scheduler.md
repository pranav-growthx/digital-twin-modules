# Guide for Implementing the Scheduler Module

You are Claude Code, implementing a scheduler module for a digital twin. This guide contains all the code and instructions needed for a complete implementation.

---

## Overview

The scheduler module adds timed and recurring task execution to a digital twin. It has two main components:

1. **`scheduler.js`** — A polling engine that checks `data/jobs.json` every 30 seconds, executes due jobs, and delivers output via console, macOS notifications, and optionally Slack.
2. **`schedule.js`** — A deterministic CLI for creating, listing, and cancelling jobs. The agent always uses this CLI rather than hand-editing the jobs file.

Both are ESM modules (`import`/`export`, `"type": "module"`).

---

## File Structure

```
scheduler-module/
  node/
    scheduler.js          # Polling engine (auto-startable)
    schedule.js           # Job-creator CLI
    package.json          # ESM project with dotenv dependency
    .env.example          # Environment variable template
    data/
      jobs.json           # Runtime job storage (gitignored)
      jobs.example.json   # Sample jobs for reference
  .claude/
    skills/
      schedule-task/
        SKILL.md          # Teaches the twin to schedule tasks
  PLAN_OF_ACTION.md       # Integration checklist
  README.md               # Quick-start documentation
```

---

## scheduler.js — Full Implementation

```javascript
#!/usr/bin/env node

/**
 * Twin Scheduler — polls data/jobs.json for due jobs, executes them,
 * delivers output via console + macOS notification (+ Slack if configured).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Cron Matcher ---
// 5-field: minute hour day-of-month month day-of-week
// Supports: *, exact numbers, comma-lists, ranges (1-5), steps (*/5, 1-10/2)

function matchCronField(field, value, rangeMin, rangeMax) {
  return field.split(",").some((part) => {
    const [rangePart, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    let start, end;
    if (rangePart === "*") {
      start = rangeMin;
      end = rangeMax;
    } else if (rangePart.includes("-")) {
      [start, end] = rangePart.split("-").map(Number);
    } else {
      start = parseInt(rangePart, 10);
      end = start;
    }

    if (step > 1 || rangePart === "*") {
      for (let i = start; i <= end; i += step) {
        if (i === value) return true;
      }
      return false;
    }
    return value >= start && value <= end;
  });
}

export function cronMatches(cronExpr, date) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minF, hourF, domF, monF, dowF] = parts;
  return (
    matchCronField(minF, date.getMinutes(), 0, 59) &&
    matchCronField(hourF, date.getHours(), 0, 23) &&
    matchCronField(domF, date.getDate(), 1, 31) &&
    matchCronField(monF, date.getMonth() + 1, 1, 12) &&
    matchCronField(dowF, date.getDay(), 0, 6)
  );
}

// --- Delivery ---

function notify(title, body) {
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${escapedBody}" with title "${escapedTitle}"'`,
      { timeout: 5000 }
    );
  } catch { /* non-fatal */ }
}

async function sendSlack(text, channel) {
  const token = process.env.SLACK_BOT_TOKEN;
  const ch = channel || process.env.SLACK_CHANNEL;
  if (!token || !ch) return;

  try {
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: ch, text }),
    });
    const data = await resp.json();
    if (!data.ok) console.error(`[scheduler] Slack error: ${data.error}`);
  } catch (err) {
    console.error(`[scheduler] Slack delivery failed: ${err.message}`);
  }
}

async function deliver(title, body, channel) {
  const label = title || "Twin Scheduler";
  console.log(`\n--- [${label}] ${new Date().toLocaleTimeString()} ---`);
  console.log(body);
  console.log("---\n");
  notify(label, body.slice(0, 200));
  await sendSlack(`*${label}*\n${body}`, channel);
}

// --- Job Execution ---

const runningJobs = new Set();

async function executeJob(job, twinDir) {
  if (runningJobs.has(job.id)) {
    console.log(`[scheduler] Skipping "${job.title || job.id}" — still running`);
    return false;
  }

  runningJobs.add(job.id);

  try {
    let output;

    if (job.prompt) {
      const cwd = twinDir || process.env.TWIN_DIR || __dirname;
      output = await new Promise((resolve, reject) => {
        const proc = spawn("claude", ["-p", job.prompt], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120_000,
        });

        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => (stdout += d.toString()));
        proc.stderr.on("data", (d) => (stderr += d.toString()));

        proc.on("close", (code) => {
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(`claude -p exited ${code}: ${stderr}`));
        });

        proc.on("error", (err) => reject(err));
      });
    } else if (job.message) {
      output = job.message;
    } else {
      output = "(no prompt or message configured)";
    }

    await deliver(job.title || job.id, output, job.channel);
    return true;
  } catch (err) {
    console.error(`[scheduler] Job "${job.title || job.id}" failed: ${err.message}`);
    return false;
  } finally {
    runningJobs.delete(job.id);
  }
}

// --- Jobs File I/O ---

function loadJobs(jobsFile) {
  if (!existsSync(jobsFile)) return [];
  try {
    return JSON.parse(readFileSync(jobsFile, "utf-8"));
  } catch { return []; }
}

function saveJobs(jobsFile, jobs) {
  writeFileSync(jobsFile, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

// --- Poll Tick ---

async function tick(jobsFile, twinDir) {
  const jobs = loadJobs(jobsFile);
  const now = new Date();
  let dirty = false;

  for (const job of jobs) {
    if (job.status !== "pending") continue;

    let due = false;

    if (job.runAt) {
      if (now >= new Date(job.runAt)) due = true;
    } else if (job.cron) {
      if (cronMatches(job.cron, now)) {
        // Prevent re-firing within the same minute
        if (job.lastRun) {
          const last = new Date(job.lastRun);
          if (
            last.getFullYear() === now.getFullYear() &&
            last.getMonth() === now.getMonth() &&
            last.getDate() === now.getDate() &&
            last.getHours() === now.getHours() &&
            last.getMinutes() === now.getMinutes()
          ) continue;
        }
        due = true;
      }
    }

    if (due) {
      const ok = await executeJob(job, twinDir);
      if (ok) {
        const isoNow = now.toISOString().slice(0, 19);
        if (job.runAt) {
          job.status = "done";
          job.lastRun = isoNow;
        } else if (job.cron) {
          job.lastRun = isoNow;
        }
        dirty = true;
      }
    }
  }

  if (dirty) saveJobs(jobsFile, jobs);
}

// --- Startup ---

let _interval = null;

export function startScheduler(options = {}) {
  if (_interval) {
    console.log("[scheduler] Already running.");
    return null;
  }

  const pollMs = options.pollMs || parseInt(process.env.POLL_MS, 10) || 30_000;
  const jobsFile = options.jobsFile || resolve(__dirname, "data", "jobs.json");
  const twinDir = options.twinDir || process.env.TWIN_DIR || null;

  console.log(`[scheduler] Started — polling every ${pollMs / 1000}s`);
  console.log(`[scheduler] Jobs file: ${jobsFile}`);

  tick(jobsFile, twinDir);

  _interval = setInterval(() => tick(jobsFile, twinDir), pollMs);
  return _interval;
}

export function stopScheduler() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
    console.log("[scheduler] Stopped.");
  }
}

// Standalone mode
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: resolve(__dirname, ".env") });
  } catch { /* dotenv optional */ }
  startScheduler();
}
```

---

## schedule.js — Full Implementation

```javascript
#!/usr/bin/env node

/**
 * Twin Schedule CLI — deterministic job creator for the scheduler.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JOBS_FILE = resolve(__dirname, "data", "jobs.json");

function ensureDataDir() {
  const dir = dirname(JOBS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadJobs() {
  if (!existsSync(JOBS_FILE)) return [];
  try { return JSON.parse(readFileSync(JOBS_FILE, "utf-8")); }
  catch { return []; }
}

function saveJobs(jobs) {
  ensureDataDir();
  writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

// --- Argument parsing ---

function parseArgs(argv) {
  const args = {};
  const positional = [];
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { flags: args, positional };
}

// --- Commands ---

function createJob(flags) {
  if (!flags.at && !flags.cron) {
    console.error("Error: Provide --at <datetime> or --cron <expression>");
    process.exit(1);
  }
  if (!flags.message && !flags.prompt) {
    console.error("Error: Provide --message <text> or --prompt <text>");
    process.exit(1);
  }

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const createdAt = new Date().toISOString().slice(0, 19);

  const job = { id, title: flags.title || null, status: "pending" };

  if (flags.at) job.runAt = flags.at;
  if (flags.cron) job.cron = flags.cron;
  if (flags.prompt) job.prompt = flags.prompt;
  if (flags.message) job.message = flags.message;
  if (flags.channel) job.channel = flags.channel;

  job.lastRun = null;
  job.createdAt = createdAt;

  const jobs = loadJobs();
  jobs.push(job);
  saveJobs(jobs);

  console.log(`Job created: ${id}`);
  if (flags.at) console.log(`  Runs at: ${flags.at}`);
  if (flags.cron) console.log(`  Cron: ${flags.cron}`);
  if (flags.title) console.log(`  Title: ${flags.title}`);
  if (flags.prompt) console.log(`  Prompt: ${flags.prompt}`);
  if (flags.message) console.log(`  Message: ${flags.message}`);
}

function listJobs() {
  const jobs = loadJobs();
  const pending = jobs.filter((j) => j.status === "pending");

  if (pending.length === 0) {
    console.log("No pending jobs.");
    return;
  }

  console.log(`\n  ${"ID".padEnd(10)} ${"Title".padEnd(25)} ${"Schedule".padEnd(25)} Type`);
  console.log(`  ${"─".repeat(10)} ${"─".repeat(25)} ${"─".repeat(25)} ${"─".repeat(10)}`);

  for (const job of pending) {
    const schedule = job.runAt || job.cron || "—";
    const type = job.prompt ? "prompt" : "message";
    const title = (job.title || "(untitled)").slice(0, 24);
    console.log(`  ${job.id.padEnd(10)} ${title.padEnd(25)} ${schedule.padEnd(25)} ${type}`);
  }

  console.log(`\n  ${pending.length} pending job(s)\n`);
}

function cancelJob(jobId) {
  if (!jobId) {
    console.error("Error: Provide a job ID to cancel");
    process.exit(1);
  }

  const jobs = loadJobs();
  const job = jobs.find((j) => j.id === jobId);

  if (!job) {
    console.error(`Error: No job found with ID "${jobId}"`);
    process.exit(1);
  }

  if (job.status === "cancelled") {
    console.log(`Job ${jobId} is already cancelled.`);
    return;
  }

  job.status = "cancelled";
  saveJobs(jobs);
  console.log(`Job cancelled: ${jobId} (${job.title || "untitled"})`);
}

// --- Main ---

const { flags, positional } = parseArgs(process.argv.slice(2));
const command = positional[0];

if (command === "list") listJobs();
else if (command === "cancel") cancelJob(positional[1]);
else if (flags.at || flags.cron) createJob(flags);
else {
  console.log(`Twin Schedule CLI

Usage:
  node schedule.js --at <datetime> --message <text> [--title <name>]
  node schedule.js --at <datetime> --prompt <text> [--title <name>]
  node schedule.js --cron <expr> --message <text> [--title <name>]
  node schedule.js --cron <expr> --prompt <text> [--title <name>]
  node schedule.js list
  node schedule.js cancel <job-id>

Flags:
  --at       ISO datetime for one-off job
  --cron     5-field cron expression for recurring job
  --message  Literal text to deliver (no LLM call)
  --prompt   Prompt to send to claude -p
  --title    Human-readable label
  --channel  Optional Slack channel override`);
}
```

---

## Integration Steps

### 1. Install dependencies

```bash
cd node/
npm install
```

### 2. Auto-start in the twin

In your twin's main entry point (e.g., `main.js` or wherever `main()` is defined):

```javascript
import { startScheduler } from "./scheduler.js";

// Inside main() or at top-level:
startScheduler();
```

The scheduler polls every 30 seconds by default. Customize with `POLL_MS` env var or the `pollMs` option.

### 3. Install the skill

Copy `.claude/skills/schedule-task/SKILL.md` to your twin's `.claude/skills/schedule-task/` directory.

### 4. Create a .env file (optional)

```bash
cp .env.example .env
# Edit .env to set SLACK_BOT_TOKEN, SLACK_CHANNEL, etc.
```

### 5. Test

```bash
# Create a test job
node schedule.js --at "$(date -v+2M '+%Y-%m-%dT%H:%M:%S')" --message "Test notification" --title "test"

# Start scheduler standalone
node scheduler.js

# Verify it fires after 2 minutes
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

1. **Created** — `schedule.js` writes job to `data/jobs.json` with `status: "pending"`
2. **Due** — Scheduler detects the job is due (one-off: `now >= runAt`; recurring: cron matches current minute)
3. **Running** — Concurrency guard prevents overlap; if still running from last tick, skip
4. **Delivered** — Output sent to console + macOS notification + Slack (if configured)
5. **Done** — One-off jobs marked `status: "done"`. Recurring jobs update `lastRun` and stay `"pending"`.
6. **Cancelled** — `schedule.js cancel <id>` marks job as `status: "cancelled"`, scheduler ignores it.
