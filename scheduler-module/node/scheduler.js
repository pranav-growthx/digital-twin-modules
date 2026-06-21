#!/usr/bin/env node

/**
 * Twin Scheduler — fires due jobs from two sources:
 *   1. data/jobs.json   — CLI-created one-off and recurring jobs
 *   2. workflows/*.workflow.md — markdown-defined scheduled workflows
 *
 * Usage:
 *   import { startScheduler } from "./scheduler.js";
 *   startScheduler();            // inside twin main()
 *
 *   node scheduler.js            // standalone
 *
 * Delivery: the scheduler calls an onResult callback with the output.
 * The platform adapter (Slack, terminal) decides where to send it.
 * Default: console + macOS notification.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Cron matcher — 5-field (minute hour dom month dow)
// Supports: *, exact numbers, comma-lists, ranges (1-5), steps (*/5, 1-10/2)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Markdown workflow parser
// ---------------------------------------------------------------------------

/**
 * Parse a .workflow.md file into a workflow definition.
 *
 * Format:
 *   ---
 *   name: daily-digest
 *   enabled: true
 *   description: Morning summary of email + Slack
 *   triggers:
 *     - type: schedule
 *       cron: "0 9 * * 1-5"
 *   ---
 *   (prompt body — sent to claude -p)
 */
function parseWorkflowFile(filePath) {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
    if (!fmMatch) return null;

    const frontmatter = fmMatch[1];
    const prompt = fmMatch[2].trim();

    const wf = { prompt, _file: filePath, _mtime: statSync(filePath).mtimeMs };

    for (const line of frontmatter.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (key === "name") wf.name = value;
      else if (key === "enabled") wf.enabled = value === "true";
      else if (key === "description") wf.description = value;
      else if (key === "cron") wf.cron = value.replace(/^["']|["']$/g, "");
      else if (key === "type" && value === "command") wf.triggerType = "command";
      else if (key === "command") wf.command = value;
    }

    // Also parse YAML-style triggers array (simple single-trigger case)
    const cronInTrigger = frontmatter.match(/cron:\s*["']?([^"'\n]+)["']?/);
    if (cronInTrigger && !wf.cron) {
      wf.cron = cronInTrigger[1].trim();
    }

    if (!wf.name) wf.name = basename(filePath, ".workflow.md");
    if (wf.enabled === undefined) wf.enabled = true;

    return wf;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Workflow registry — scans workflows/ dir, hot-reloads on change
// ---------------------------------------------------------------------------

/** @type {Map<string, object>} */
const workflows = new Map();
let _workflowDir = null;

function scanWorkflows(dir) {
  if (!existsSync(dir)) return;

  const files = readdirSync(dir).filter((f) => f.endsWith(".workflow.md"));

  // Detect changes
  const currentFiles = new Set(files.map((f) => join(dir, f)));

  // Remove workflows whose files are gone
  for (const [name, wf] of workflows) {
    if (!currentFiles.has(wf._file)) {
      workflows.delete(name);
      console.log(`[scheduler] Unloaded workflow: ${name}`);
    }
  }

  // Add or update workflows
  for (const file of files) {
    const filePath = join(dir, file);
    const existing = [...workflows.values()].find((w) => w._file === filePath);

    // Skip if file hasn't changed
    if (existing) {
      try {
        const mtime = statSync(filePath).mtimeMs;
        if (mtime === existing._mtime) continue;
      } catch {
        continue;
      }
    }

    const wf = parseWorkflowFile(filePath);
    if (wf && wf.name) {
      const isReload = workflows.has(wf.name);
      workflows.set(wf.name, wf);
      console.log(`[scheduler] ${isReload ? "Reloaded" : "Loaded"} workflow: ${wf.name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Default delivery — console + macOS notification
// ---------------------------------------------------------------------------

function defaultOnResult(title, body) {
  console.log(`\n--- [${title}] ${new Date().toLocaleTimeString()} ---`);
  console.log(body);
  console.log("---\n");

  try {
    const t = title.replace(/"/g, '\\"');
    const b = body.slice(0, 200).replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${b}" with title "${t}"'`,
      { timeout: 5000 }
    );
  } catch {
    // macOS notification failed — non-fatal
  }
}

// ---------------------------------------------------------------------------
// Job execution
// ---------------------------------------------------------------------------

const runningJobs = new Set();

function runClaude(prompt, twinDir) {
  const cwd = twinDir || process.env.TWIN_DIR || __dirname;
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", prompt], {
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
}

async function executeJob(job, twinDir, onResult) {
  const id = job.id || job.name;
  if (runningJobs.has(id)) return false;

  runningJobs.add(id);

  try {
    let output;
    if (job.prompt) {
      output = await runClaude(job.prompt, twinDir);
    } else if (job.message) {
      output = job.message;
    } else {
      output = "(no prompt or message configured)";
    }

    onResult(job.title || job.name || id, output);
    return true;
  } catch (err) {
    console.error(`[scheduler] Job "${id}" failed: ${err.message}`);
    return false;
  } finally {
    runningJobs.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Jobs file I/O (data/jobs.json)
// ---------------------------------------------------------------------------

function loadJobs(jobsFile) {
  if (!existsSync(jobsFile)) return [];
  try {
    return JSON.parse(readFileSync(jobsFile, "utf-8"));
  } catch {
    return [];
  }
}

function saveJobs(jobsFile, jobs) {
  writeFileSync(jobsFile, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Minute key for same-minute dedup
// ---------------------------------------------------------------------------

function minuteKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Poll tick
// ---------------------------------------------------------------------------

async function tick(jobsFile, twinDir, onResult) {
  const now = new Date();
  const mk = minuteKey(now);

  // ── 1. JSON jobs ──────────────────────────────────────────────────────────
  const jobs = loadJobs(jobsFile);
  let dirty = false;

  for (const job of jobs) {
    if (job.status !== "pending") continue;

    let due = false;

    if (job.runAt) {
      if (now >= new Date(job.runAt)) due = true;
    } else if (job.cron) {
      if (cronMatches(job.cron, now) && job.lastRun !== mk) due = true;
    }

    if (due) {
      const ok = await executeJob(job, twinDir, onResult);
      if (ok) {
        job.lastRun = mk;
        if (job.runAt) job.status = "done";
        dirty = true;
      }
    }
  }

  if (dirty) saveJobs(jobsFile, jobs);

  // ── 2. Markdown workflows ────────────────────────────────────────────────
  if (_workflowDir) scanWorkflows(_workflowDir);

  for (const [name, wf] of workflows) {
    if (!wf.enabled || !wf.cron) continue;
    if (!cronMatches(wf.cron, now)) continue;
    if (wf._lastRun === mk) continue; // same-minute dedup

    const ok = await executeJob(
      { name, prompt: wf.prompt, title: wf.description || name },
      twinDir,
      onResult
    );
    if (ok) wf._lastRun = mk;
  }
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

let _interval = null;

/**
 * Start the scheduler.
 *
 * @param {object} [options]
 * @param {number} [options.pollMs] - Poll interval in ms (default: 30000)
 * @param {string} [options.jobsFile] - Path to jobs.json
 * @param {string} [options.twinDir] - Working directory for claude -p
 * @param {string} [options.workflowDir] - Path to workflows/ directory
 * @param {function} [options.onResult] - Callback (title, body) for job output.
 *   Default: console + macOS notification. The platform adapter (Slack, etc.)
 *   should pass its own callback to route output to the right place.
 */
export function startScheduler(options = {}) {
  if (_interval) {
    console.log("[scheduler] Already running.");
    return null;
  }

  const pollMs = options.pollMs || parseInt(process.env.POLL_MS, 10) || 30_000;
  const jobsFile = options.jobsFile || resolve(__dirname, "data", "jobs.json");
  const twinDir = options.twinDir || process.env.TWIN_DIR || null;
  const onResult = options.onResult || defaultOnResult;

  _workflowDir = options.workflowDir || resolve(__dirname, "workflows");

  console.log(`[scheduler] Started — polling every ${pollMs / 1000}s`);
  console.log(`[scheduler] Jobs: ${jobsFile}`);
  if (existsSync(_workflowDir)) {
    console.log(`[scheduler] Workflows: ${_workflowDir}`);
    scanWorkflows(_workflowDir);
  }

  tick(jobsFile, twinDir, onResult);

  _interval = setInterval(() => tick(jobsFile, twinDir, onResult), pollMs);
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
  process.argv[1] && resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: resolve(__dirname, ".env") });
  } catch {
    // dotenv not installed — fine
  }

  startScheduler();
}
