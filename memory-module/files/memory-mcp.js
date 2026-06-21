#!/usr/bin/env node

/**
 * Memory MCP Server
 *
 * Stdio-based MCP server that exposes the memory store as tools.
 * Designed for Claude Code's .mcp.json integration.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createMemoryStore } from "./memory-store.js";

const dbPath = process.env.MEMORY_DB_PATH || "./data/memory.db";
const store = createMemoryStore(dbPath);

const server = new McpServer({
  name: "memory",
  version: "1.0.0",
});

// ── memory_recall ──────────────────────────────────────────────────────

server.tool(
  "memory_recall",
  "Search memory for relevant past context. Returns ranked memories using FTS5 full-text search with BM25, recency, importance, and usage scoring.",
  {
    query: z.string().describe("Search query to find relevant memories"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(5)
      .describe("Maximum number of memories to return (default 5)"),
  },
  async ({ query, limit }) => {
    try {
      const results = store.recall(query, { limit });
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No memories found." }] };
      }
      const formatted = results
        .map(
          (m, i) =>
            `${i + 1}. [${m.kind}] ${m.title} (importance: ${m.importance}, score: ${m.score.toFixed(3)})\n   ${m.body.slice(0, 400)}`
        )
        .join("\n\n");
      return { content: [{ type: "text", text: formatted }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error recalling memories: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── memory_remember ────────────────────────────────────────────────────

server.tool(
  "memory_remember",
  "Save something to memory as an event, lesson, or fact.",
  {
    content: z.string().describe("The content to remember"),
    importance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.5)
      .describe("Importance score from 0.0 to 1.0 (default 0.5)"),
    kind: z
      .enum(["event", "lesson", "fact"])
      .optional()
      .default("event")
      .describe("Memory kind: event, lesson, or fact (default event)"),
    title: z
      .string()
      .optional()
      .describe("Optional title (auto-generated from content if omitted)"),
  },
  async ({ content, importance, kind, title }) => {
    try {
      const opts = { importance, kind };
      if (title) opts.title = title;
      const result = store.remember(content, opts);
      return {
        content: [
          {
            type: "text",
            text: `Remembered (id: ${result.id}, kind: ${kind}, importance: ${importance})`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error saving memory: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── memory_add_fact ────────────────────────────────────────────────────

server.tool(
  "memory_add_fact",
  "Store a curated fact with higher recall priority than regular events.",
  {
    title: z.string().describe("Fact title"),
    body: z.string().describe("Fact body/content"),
    importance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.7)
      .describe("Importance score (default 0.7)"),
  },
  async ({ title, body, importance }) => {
    try {
      const result = store.addFact(title, body, { importance });
      return {
        content: [{ type: "text", text: `Fact added (id: ${result.id}, importance: ${importance})` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error adding fact: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── memory_add_lesson ──────────────────────────────────────────────────

server.tool(
  "memory_add_lesson",
  "Store a lesson learned, with context for when it applies.",
  {
    title: z.string().describe("Lesson title"),
    body: z.string().describe("Lesson content"),
    appliesWhen: z.string().describe("Context for when this lesson is relevant"),
    importance: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.8)
      .describe("Importance score (default 0.8)"),
  },
  async ({ title, body, appliesWhen, importance }) => {
    try {
      const result = store.addLesson(title, body, appliesWhen, { importance });
      return {
        content: [{ type: "text", text: `Lesson added (id: ${result.id}, importance: ${importance})` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error adding lesson: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── memory_stats ───────────────────────────────────────────────────────

server.tool(
  "memory_stats",
  "Get memory statistics: total, active, archived counts by kind.",
  {},
  async () => {
    try {
      const s = store.stats();
      const text = [
        `Memory Statistics:`,
        `  Total:    ${s.total}`,
        `  Active:   ${s.active_count}`,
        `  Archived: ${s.archived_count}`,
        `  Events:   ${s.events}`,
        `  Lessons:  ${s.lessons}`,
        `  Facts:    ${s.facts}`,
      ].join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error getting stats: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── memory_consolidate ─────────────────────────────────────────────────

server.tool(
  "memory_consolidate",
  "Run memory maintenance: archive stale events (>30 days, low importance, never recalled) and unused facts.",
  {},
  async () => {
    try {
      const result = store.consolidate();
      return {
        content: [
          {
            type: "text",
            text: `Consolidation complete:\n  Archived events: ${result.archivedEvents}\n  Stale facts: ${result.staleFacts}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error during consolidation: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Start server ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Memory MCP server failed to start:", err);
  process.exit(1);
});
