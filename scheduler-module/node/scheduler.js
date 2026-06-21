#!/usr/bin/env node

/**
 * Twin Scheduler — polls data/jobs.json for due jobs, executes them,
 * delivers output via console + macOS notification (+ Slack if configured).
 *
 * Usage:
 *   import { startScheduler } from "./scheduler.js";
 *   startScheduler();            // inside twin main()
 *
 *   node scheduler.js            // standalone
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Cron matcher — 5-field (minute hour dom month dow)
// Supports: *, exact numbers, comma-lists, ranges (1-5), steps (*/5, 1-10/2)
// ---------------------------------------------------------------------------

function matchCronField(field, value, rangeMin, rangeMax) {
  // field = one segment of the cron expression (e.g. "*/5" or "1,3,5" or "1-5")
  // value = current time component (0-59 for minutes, etc.)
  return field.split(",").some((part) => {
    // Handle step values
    const [rangePart, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    let start, end;
    if (rangePart === "*") {
      start = rangeMin;
      end = rangeMax;
    } else if (rangePart.includes("-")) {
      [start, end] = rangePart.split("-").map(Number);
    } else {
      // exact number
      start = parseInt(rangePart, 10);
      end = start;
    }

    // If step is set, enumerate and check
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
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const dow = date.getDay(); // 0=Sun

  return (
    matchCronField(minF, minute, 0, 59) &&
    matchCronField(hourF, hour, 0, 23) &&
    matchCronField(domF, dom, 1, 31) &&
    matchCronField(monF, month, 1, 12) &&
    matchCronField(dowF, dow, 0, 6)
  );
}

// ---------------------------------------------------------------------------
// Delivery helpers
// ---------------------------------------------------------------------------

function notify(title, body) {
  try {
    const escapedTitle = title.replace(/"/g, '\\"');
    const escapedBody = body.replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${escapedBody}" with title "${escapedTitle}"'`,
      { timeout: 5000 }
    );
  } catch {
    // macOS notification failed — non-fatal
  }
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
    if (!data.ok) {
      console.error(`[scheduler] Slack error: ${data.error}`);
    }
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

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

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
      // Spawn claude -p in twin directory for persona-aware response
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

// ---------------------------------------------------------------------------
// Jobs file I/O
// ---------------------------------------------------------------------------

function loadJobs(jobsFile) {
  if (!existsSync(jobsFile)) return [];
  try {
    const raw = readFileSync(jobsFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveJobs(jobsFile, jobs) {
  writeFileSync(jobsFile, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Poll tick
// ---------------------------------------------------------------------------

async function tick(jobsFile, twinDir) {
  const jobs = loadJobs(jobsFile);
  const now = new Date();
  let dirty = false;

  for (const job of jobs) {
    if (job.status !== "pending") continue;

    let due = false;

    if (job.runAt) {
      // One-off job
      const runAt = new Date(job.runAt);
      if (now >= runAt) due = true;
    } else if (job.cron) {
      // Recurring job — check if cron matches current minute
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
          ) {
            continue; // already fired this minute
          }
        }
        due = true;
      }
    }

    if (due) {
      const ok = await executeJob(job, twinDir);
      if (ok) {
        const isoNow = now.toISOString().slice(0, 19); // local-style, no Z
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

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

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

  // Initial tick
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

// ---------------------------------------------------------------------------
// Standalone mode
// ---------------------------------------------------------------------------

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === __filename;

if (isMain) {
  // Load .env if present
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: resolve(__dirname, ".env") });
  } catch {
    // dotenv not installed — that's fine
  }

  startScheduler();
}
