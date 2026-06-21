#!/usr/bin/env node

/**
 * Twin Schedule CLI — deterministic job creator for the scheduler.
 *
 * Usage:
 *   node schedule.js --at "2026-06-21T17:00:00" --message "Don't forget the call"
 *   node schedule.js --at "2026-06-21T17:00:00" --prompt "Write a reminder" --title "call reminder"
 *   node schedule.js --cron "0 9 * * 1-5" --message "Standup in 30 minutes"
 *   node schedule.js --cron "0 9 * * 1-5" --prompt "Summarize emails" --title "daily digest"
 *   node schedule.js list
 *   node schedule.js cancel <job-id>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JOBS_FILE = resolve(__dirname, "data", "jobs.json");

// ---------------------------------------------------------------------------
// Jobs file helpers
// ---------------------------------------------------------------------------

function ensureDataDir() {
  const dir = dirname(JOBS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function loadJobs() {
  if (!existsSync(JOBS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(JOBS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveJobs(jobs) {
  ensureDataDir();
  writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Argument parsing (no external deps)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

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
  const now = new Date();
  const createdAt = now.toISOString().slice(0, 19);

  const job = {
    id,
    title: flags.title || null,
    status: "pending",
  };

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

  return id;
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const userArgs = process.argv.slice(2);
const { flags, positional } = parseArgs(userArgs);

const command = positional[0];

if (command === "list") {
  listJobs();
} else if (command === "cancel") {
  cancelJob(positional[1]);
} else if (flags.at || flags.cron) {
  createJob(flags);
} else {
  console.log(`Twin Schedule CLI

Usage:
  node schedule.js --at <datetime> --message <text> [--title <name>]
  node schedule.js --at <datetime> --prompt <text> [--title <name>]
  node schedule.js --cron <expr> --message <text> [--title <name>]
  node schedule.js --cron <expr> --prompt <text> [--title <name>]
  node schedule.js list
  node schedule.js cancel <job-id>

Flags:
  --at       ISO datetime for one-off job (e.g. "2026-06-21T17:00:00")
  --cron     5-field cron expression for recurring job (e.g. "0 9 * * 1-5")
  --message  Literal text to deliver (no LLM call)
  --prompt   Prompt to send to claude -p (LLM generates output)
  --title    Human-readable label for the job
  --channel  Optional Slack channel override`);
}
