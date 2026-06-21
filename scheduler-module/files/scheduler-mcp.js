#!/usr/bin/env node

/**
 * Twin Scheduler MCP Server — exposes scheduler operations as MCP tools.
 *
 * Tools:
 *   schedule_task  — Create a one-off or recurring scheduled task
 *   list_jobs      — List all pending scheduled jobs
 *   cancel_job     — Cancel a scheduled job by ID
 *   create_workflow — Create a markdown workflow file
 *
 * Usage (stdio transport):
 *   node scheduler-mcp.js
 *
 * Designed for .mcp.json:
 *   { "mcpServers": { "scheduler": { "command": "node", "args": ["scheduler-mcp.js"] } } }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JOBS_FILE = resolve(__dirname, "data", "jobs.json");
const WORKFLOWS_DIR = resolve(__dirname, "workflows");

// --- Helpers ----------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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
  ensureDir(dirname(JOBS_FILE));
  writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2) + "\n", "utf-8");
}

// --- MCP Server -------------------------------------------------------------

const server = new McpServer({ name: "twin-scheduler", version: "1.0.0" });

// schedule_task
server.tool(
  "schedule_task",
  "Create a one-off or recurring scheduled task",
  {
    at: z.string().optional().describe("ISO datetime for a one-off job (e.g. 2026-06-21T17:00:00)"),
    cron: z.string().optional().describe("5-field cron expression for a recurring job (e.g. 0 9 * * 1-5)"),
    message: z.string().optional().describe("Literal text to deliver as-is"),
    prompt: z.string().optional().describe("Prompt to send to claude -p for LLM-generated output"),
    title: z.string().optional().describe("Human-readable label for the job"),
  },
  async ({ at, cron, message, prompt, title }) => {
    if (at && cron) {
      return { content: [{ type: "text", text: "Error: provide `at` OR `cron`, not both." }], isError: true };
    }
    if (!at && !cron) {
      return { content: [{ type: "text", text: "Error: provide `at` (ISO datetime) or `cron` (5-field expression)." }], isError: true };
    }
    if (message && prompt) {
      return { content: [{ type: "text", text: "Error: provide `message` OR `prompt`, not both." }], isError: true };
    }
    if (!message && !prompt) {
      return { content: [{ type: "text", text: "Error: provide `message` (literal text) or `prompt` (LLM prompt)." }], isError: true };
    }

    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const job = {
      id,
      title: title || null,
      status: "pending",
      ...(at ? { runAt: at } : {}),
      ...(cron ? { cron } : {}),
      ...(prompt ? { prompt } : {}),
      ...(message ? { message } : {}),
      lastRun: null,
      createdAt: new Date().toISOString().slice(0, 19),
    };

    const jobs = loadJobs();
    jobs.push(job);
    saveJobs(jobs);

    const schedule = at ? `at ${at}` : `cron ${cron}`;
    const type = prompt ? "prompt" : "message";
    return {
      content: [{ type: "text", text: `Scheduled job ${id} (${type}, ${schedule})${title ? ` — "${title}"` : ""}` }],
    };
  }
);

// list_jobs
server.tool(
  "list_jobs",
  "List all pending scheduled jobs",
  {},
  async () => {
    const jobs = loadJobs();
    const pending = jobs.filter((j) => j.status === "pending");

    if (pending.length === 0) {
      return { content: [{ type: "text", text: "No pending jobs." }] };
    }

    const lines = pending.map((j) => {
      const schedule = j.runAt ? `at ${j.runAt}` : `cron ${j.cron}`;
      const type = j.prompt ? "prompt" : "message";
      return `- ${j.id}  ${(j.title || "(untitled)").padEnd(24)}  ${schedule.padEnd(28)}  ${type}`;
    });

    return {
      content: [{ type: "text", text: `Pending jobs (${pending.length}):\n${lines.join("\n")}` }],
    };
  }
);

// cancel_job
server.tool(
  "cancel_job",
  "Cancel a scheduled job by ID",
  {
    jobId: z.string().describe("The job ID to cancel"),
  },
  async ({ jobId }) => {
    const jobs = loadJobs();
    const job = jobs.find((j) => j.id === jobId);

    if (!job) {
      return { content: [{ type: "text", text: `Error: no job found with ID "${jobId}".` }], isError: true };
    }
    if (job.status === "cancelled") {
      return { content: [{ type: "text", text: `Job ${jobId} is already cancelled.` }] };
    }

    job.status = "cancelled";
    saveJobs(jobs);

    return {
      content: [{ type: "text", text: `Cancelled job ${jobId} (${job.title || "untitled"}).` }],
    };
  }
);

// create_workflow
server.tool(
  "create_workflow",
  "Create a markdown workflow file that the scheduler picks up automatically",
  {
    name: z.string().describe("Workflow name (used as filename, e.g. daily-digest)"),
    description: z.string().optional().describe("Short description of the workflow"),
    cron: z.string().describe("5-field cron expression (e.g. 0 9 * * 1-5)"),
    prompt: z.string().describe("Prompt body sent to claude -p when the cron fires"),
    enabled: z.boolean().default(true).describe("Whether the workflow is active"),
  },
  async ({ name, description, cron, prompt, enabled }) => {
    ensureDir(WORKFLOWS_DIR);

    const safeName = name.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const filePath = resolve(WORKFLOWS_DIR, `${safeName}.workflow.md`);

    const frontmatter = [
      "---",
      `name: ${safeName}`,
      `enabled: ${enabled}`,
      ...(description ? [`description: ${description}`] : []),
      `cron: "${cron}"`,
      "---",
    ].join("\n");

    const content = `${frontmatter}\n\n${prompt.trim()}\n`;
    writeFileSync(filePath, content, "utf-8");

    return {
      content: [{ type: "text", text: `Created workflow: ${safeName}.workflow.md (cron: ${cron}, enabled: ${enabled})` }],
    };
  }
);

// --- Start ------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
