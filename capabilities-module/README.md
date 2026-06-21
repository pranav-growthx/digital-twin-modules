# Capabilities Module

> **If you are Claude Code or Codex:** read `PLAN_OF_ACTION.md` first, then follow its checklist step by step. Use the guides in this directory as reference. Do not improvise — follow the documented steps.

---

## What This Module Does

This module teaches you how to give your digital twin **capabilities** — the ability to read email, check calendars, search the web, query databases, and more. Your twin's brain is `claude -p`, and it gains capabilities through three mechanisms.

---

## Three Ways to Add Capabilities

### 1. Claude Connectors (Zero Setup)

Claude Connectors are the easiest path. You authenticate once on the web, and the tools appear automatically in `claude -p`.

**How:** Go to [claude.ai/customize/connectors](https://claude.ai/customize/connectors), find the service (e.g., Gmail, Google Calendar), click Connect, and sign in with your Google account.

**What you get:** MCP tools like `mcp__claude_ai_Gmail__*` become available to your twin with no terminal configuration.

**Best for:** Gmail, Google Calendar, Google Drive — anything Claude offers as a built-in connector.

### 2. MCP Servers (The Universal Plug)

MCP (Model Context Protocol) is the standard way to give any AI agent new tools. An MCP server is a small program that exposes tools — your twin connects to it, and the tools appear.

**How:** Run `claude mcp add <name> npx <package>` in your terminal, or add the server to `.mcp.json`.

**Examples:**
```bash
# Slack
claude mcp add slack npx @anthropic/slack-mcp-server

# Web search (Brave)
claude mcp add brave-search npx @anthropic/brave-search-mcp-server

# Web search (Tavily)
claude mcp add tavily npx tavily-mcp-server

# PostgreSQL database
claude mcp add postgres npx @anthropic/postgres-mcp-server

# MongoDB database
claude mcp add mongodb npx mongodb-mcp-server

# Filesystem access
claude mcp add filesystem npx @anthropic/filesystem-mcp-server
```

**Best for:** Anything not covered by connectors — Slack, web search, databases, custom APIs.

### 3. Skills (Orchestration Layer)

Skills are `.claude/skills/<name>/SKILL.md` files that teach the agent **when** and **how** to use its capabilities in combination. Skills don't implement capabilities — they orchestrate existing MCP tools.

**How:** Create a `SKILL.md` file with YAML frontmatter (name, description, trigger conditions) and a body of instructions.

**Example:** The `email-replies` skill in this module tells the twin: "When the user asks to read their email, use Gmail tools to fetch unread messages, filter out automated mail, draft replies in the agent's voice, and save them to a file."

**Best for:** Multi-step workflows that combine multiple tools with judgment and persona.

---

## Common Capabilities Reference

| Capability | Method | Setup |
|---|---|---|
| **Gmail (read)** | Connector | [claude.ai/customize/connectors](https://claude.ai/customize/connectors) → Gmail → Connect |
| **Google Calendar** | Connector | [claude.ai/customize/connectors](https://claude.ai/customize/connectors) → Calendar → Connect |
| **Google Drive** | Connector | [claude.ai/customize/connectors](https://claude.ai/customize/connectors) → Drive → Connect |
| **Slack** | MCP Server | `claude mcp add slack npx @anthropic/slack-mcp-server` |
| **Web Search (Brave)** | MCP Server | `claude mcp add brave-search npx @anthropic/brave-search-mcp-server` |
| **Web Search (Tavily)** | MCP Server | `claude mcp add tavily npx tavily-mcp-server` |
| **PostgreSQL** | MCP Server | `claude mcp add postgres npx @anthropic/postgres-mcp-server` |
| **MongoDB** | MCP Server | `claude mcp add mongodb npx mongodb-mcp-server` |
| **Filesystem** | MCP Server | `claude mcp add filesystem npx @anthropic/filesystem-mcp-server` |
| **GitHub** | MCP Server | `claude mcp add github npx @anthropic/github-mcp-server` |

---

## Files in This Module

| File | Purpose |
|---|---|
| `PLAN_OF_ACTION.md` | Step-by-step checklist for the agent to follow |
| `guide for implementing capabilities.md` | Full technical guide |
| `GMAIL_CONNECTOR_SETUP.md` | Step-by-step Gmail connector setup |
| `MCP_QUICKSTART.md` | MCP quick reference and examples |
| `skills/email-replies/SKILL.md` | Skill: draft replies to unread emails (copy to participant's `.claude/skills/email-replies/SKILL.md` during install) |
| `commands/reply.md` | `/reply` command: draft a single reply (copy to participant's `.claude/commands/reply.md` during install) |
