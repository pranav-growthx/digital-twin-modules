# Guide for Implementing Capabilities

This guide covers everything you need to know about giving your digital twin capabilities — from zero-setup connectors to custom MCP servers and orchestration skills.

---

## How MCP Works with `claude -p`

MCP (Model Context Protocol) is the standard way AI agents discover and use tools. Here's the mental model:

```
Your Twin (claude -p)
    |
    |--- connects to ---> MCP Server A (e.g., Gmail)
    |                         |--- tool: search_emails
    |                         |--- tool: get_email
    |                         |--- tool: list_labels
    |
    |--- connects to ---> MCP Server B (e.g., Slack)
    |                         |--- tool: send_message
    |                         |--- tool: list_channels
    |
    |--- reads ----------> Skills (.claude/skills/*)
                              |--- "when user asks about email, do X then Y"
```

When you run `claude -p "read my email"`, the agent:
1. Sees the prompt
2. Checks which MCP tools are available
3. Reads any relevant skills
4. Decides which tools to call and in what order
5. Executes the plan and returns the result

MCP servers can be:
- **Claude Connectors** — hosted by Anthropic, authenticated via the web
- **Local MCP servers** — npm packages running on your machine
- **Remote MCP servers** — hosted elsewhere, connected via URL

---

## Setting Up Gmail Connector (Web Auth)

Gmail uses Claude's built-in connector system. This is **not** a terminal MCP server — it's authenticated through the web.

### Steps

1. Open [claude.ai/customize/connectors](https://claude.ai/customize/connectors) in your browser
2. Find **Gmail** in the list of available connectors
3. Click **Connect**
4. Sign in with your Google account
5. Review the permissions — Claude requests **read-only** access to your email
6. Click **Allow**
7. You should see Gmail show as **Connected**

### What You Get

Once connected, the following MCP tools become available to `claude -p`:

- `mcp__claude_ai_Gmail__authenticate` — initiate auth (if needed)
- `mcp__claude_ai_Gmail__complete_authentication` — complete auth flow

The Gmail connector provides read access to your inbox. It does **not** send emails on your behalf.

### Verification

```bash
claude -p "Use Gmail tools to list my 3 most recent emails. Show subject and sender."
```

If this returns email data, the connector is working.

### Troubleshooting

- **"No Gmail tools available"** — Make sure you completed the web auth at claude.ai/customize/connectors
- **"Authentication required"** — The connector may need re-authentication. Go back to the connectors page and reconnect.
- **Wrong account** — Disconnect and reconnect with the correct Google account

---

## Setting Up Google Calendar Connector

Same process as Gmail, different connector.

### Steps

1. Open [claude.ai/customize/connectors](https://claude.ai/customize/connectors)
2. Find **Google Calendar** → Click **Connect**
3. Sign in with your Google account → **Allow**
4. Confirm it shows as **Connected**

### Verification

```bash
claude -p "What's on my calendar today? Use Google Calendar tools."
```

---

## Adding MCP Servers via CLI

The `claude mcp add` command is the fastest way to add an MCP server.

### Syntax

```bash
claude mcp add <name> npx <npm-package-name> [args...]
```

### Examples

**Slack:**
```bash
claude mcp add slack npx @anthropic/slack-mcp-server
```

**Brave Search (requires API key):**
```bash
BRAVE_API_KEY=your-key-here claude mcp add brave-search npx @anthropic/brave-search-mcp-server
```

**PostgreSQL:**
```bash
claude mcp add postgres npx @anthropic/postgres-mcp-server postgresql://user:pass@host:5432/dbname
```

**MongoDB:**
```bash
claude mcp add mongodb npx mongodb-mcp-server --connectionString "mongodb+srv://..."
```

**Filesystem:**
```bash
claude mcp add filesystem npx @anthropic/filesystem-mcp-server /path/to/directory
```

### Verification

After adding a server, verify it's registered:

```bash
claude mcp list
```

Then test it:

```bash
claude -p "Use the <name> tools to <do something simple>"
```

---

## Adding MCP Servers via `.mcp.json`

For projects that need reproducible MCP configurations, use a `.mcp.json` file in your project root.

### Format

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["@anthropic/slack-mcp-server"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-token"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["@anthropic/brave-search-mcp-server"],
      "env": {
        "BRAVE_API_KEY": "your-api-key"
      }
    },
    "postgres": {
      "command": "npx",
      "args": [
        "@anthropic/postgres-mcp-server",
        "postgresql://user:pass@localhost:5432/mydb"
      ]
    }
  }
}
```

### Where to Place It

- **Project-level:** `.mcp.json` in your project root — applies to all `claude` sessions in that directory
- **User-level:** `~/.claude/.mcp.json` — applies globally to all `claude` sessions

### Advantages Over CLI

- Checked into version control (minus secrets)
- Reproducible across machines
- Can use environment variables for secrets
- Self-documenting

---

## Creating Custom Skills

Skills are instruction files that teach the agent how to orchestrate capabilities. They live in `.claude/skills/<name>/SKILL.md`.

### Anatomy of a Skill

```markdown
---
name: my-skill
description: >-
  What this skill does and when to trigger it.
  This description tells the agent WHEN to activate the skill.
---

## Instructions

Step-by-step instructions for the agent to follow when this skill is triggered.

1. First, do X using tool Y
2. Then, do Z using tool W
3. Save the output to <path>
4. Report what was done

## Important

- Never do A
- Always check B before C
- If D is missing, use a [bracketed placeholder]
```

### Key Principles

1. **Skills orchestrate, they don't implement.** A skill tells the agent which MCP tools to use and in what order. It doesn't contain the tool logic itself.

2. **The description is a trigger.** The agent reads skill descriptions to decide which skill to activate. Write the description to match what a user would say.

3. **Be explicit about safety.** If a skill should never send an email, say so. If it should never delete data, say so.

4. **Stay persona-neutral.** Skills should reference `CLAUDE.md` and `PERSONA.md` for voice and style, not hardcode a personality.

### Example: A Daily Briefing Skill

```markdown
---
name: daily-briefing
description: >-
  Generate a daily briefing combining email, calendar, and news.
  Trigger when the user asks for their daily briefing, morning update,
  or "what's going on today."
---

1. Fetch today's calendar events using Google Calendar tools
2. Fetch the 10 most recent unread emails using Gmail tools
3. Search the web for news relevant to the user's industry (read CLAUDE.md for context)
4. Compile into a briefing with sections: Schedule, Email Highlights, News
5. Save to `briefings/briefing-<YYYY-MM-DD>.md`
6. Report: "Daily briefing saved to briefings/briefing-<date>.md"
```

---

## Testing Each Capability

After setup, verify each capability with a targeted prompt.

### Gmail
```bash
claude -p "List my 5 most recent unread emails. Show subject, sender, and date."
```

### Google Calendar
```bash
claude -p "What meetings do I have scheduled for today and tomorrow?"
```

### Slack
```bash
claude -p "List the channels I'm in on Slack."
```

### Web Search
```bash
claude -p "Search the web for 'Model Context Protocol MCP' and summarize the top 3 results."
```

### Database
```bash
claude -p "List all tables in the connected database and their row counts."
```

### Skills
```bash
# Test the email-replies skill
claude -p "Read my unread emails and draft replies."

# Test the /reply command
claude -p "/reply Subject: Meeting tomorrow\nFrom: alice@example.com\nBody: Can we push our 2pm to 3pm?"
```

---

## Troubleshooting

### "Tool not found" or "No tools available"

- For connectors: re-authenticate at [claude.ai/customize/connectors](https://claude.ai/customize/connectors)
- For MCP servers: run `claude mcp list` to check if the server is registered
- For MCP servers: check that the npm package is installed (`npx` should handle this automatically)

### "Permission denied" or "Unauthorized"

- Check that API keys and tokens are set correctly
- For connectors: try disconnecting and reconnecting
- For MCP servers with env vars: verify the env vars are set in your shell or `.mcp.json`

### MCP Server Crashes on Start

- Run the server manually to see errors: `npx <package-name>`
- Check Node.js version: most MCP servers need Node 18+
- Check for missing dependencies

### Skill Not Triggering

- Verify the skill file is at `.claude/skills/<name>/SKILL.md`
- Check that the `description` field matches how you're phrasing your request
- Try referencing the skill explicitly: "Use the email-replies skill to read my mail"
