#!/usr/bin/env node
// slack-mcp.js — MCP server for outbound Slack actions.
//
// Exposes send / edit / delete / list as MCP tools so your agent can act on
// Slack without shelling out. The inbound side (listening for messages,
// replying) is handled by slack-bot.js — this server is outbound only.
//
// Requires SLACK_BOT_TOKEN in the environment.
//
// Run:  node slack-mcp.js   (stdio transport — meant to be launched by .mcp.json)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const TOKEN = process.env.SLACK_BOT_TOKEN;
if (!TOKEN) {
  console.error("SLACK_BOT_TOKEN is not set. Add it to .env or pass it via .mcp.json env.");
  process.exit(1);
}

// ── Slack API helper ────────────────────────────────────────────────────────

async function slack(method, payload) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error}`);
  return data;
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "slack-actions",
  version: "1.0.0",
});

// Send a message
server.tool(
  "slack_send_message",
  "Send a message to a Slack channel or DM",
  {
    channel: z.string().describe("Channel ID (e.g. C0123ABC) or user ID for DM"),
    text: z.string().describe("Message text to send"),
  },
  async ({ channel, text }) => {
    try {
      const r = await slack("chat.postMessage", { channel, text });
      return { content: [{ type: "text", text: `Message sent. ts=${r.ts}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// Edit a message
server.tool(
  "slack_edit_message",
  "Edit a message the bot previously sent",
  {
    channel: z.string().describe("Channel ID where the message lives"),
    ts: z.string().describe("Timestamp of the message to edit"),
    text: z.string().describe("New message text"),
  },
  async ({ channel, ts, text }) => {
    try {
      await slack("chat.update", { channel, ts, text });
      return { content: [{ type: "text", text: `Message edited. ts=${ts}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// Delete a message
server.tool(
  "slack_delete_message",
  "Delete a message the bot previously sent",
  {
    channel: z.string().describe("Channel ID where the message lives"),
    ts: z.string().describe("Timestamp of the message to delete"),
  },
  async ({ channel, ts }) => {
    try {
      await slack("chat.delete", { channel, ts });
      return { content: [{ type: "text", text: `Message deleted. ts=${ts}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// List recent messages
server.tool(
  "slack_list_messages",
  "List recent messages in a Slack channel",
  {
    channel: z.string().describe("Channel ID to list messages from"),
    limit: z.number().optional().default(10).describe("Number of messages to return (default 10)"),
  },
  async ({ channel, limit }) => {
    try {
      const r = await slack("conversations.history", { channel, limit });
      const lines = (r.messages || []).map((m) => {
        const preview = (m.text || "").replace(/\s+/g, " ").slice(0, 100);
        return `${m.ts} | ${m.user || m.bot_id || "?"} | ${preview}`;
      });
      return { content: [{ type: "text", text: lines.join("\n") || "(no messages)" }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

// ── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
