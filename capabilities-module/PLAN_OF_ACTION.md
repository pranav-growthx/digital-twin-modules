# Plan of Action — Capabilities Module

Follow this checklist in order. Do not skip steps.

---

## Pre-Flight

- [ ] Read this module's `README.md` to understand the three capability methods
- [ ] Read the user's `CLAUDE.md` and `PERSONA.md` (if they exist) to understand their preferences and voice

---

## Step 1: Discover What the User Wants

- [ ] Ask the user which capabilities they want their twin to have. Common options:
  - Email (read inbox, draft replies)
  - Calendar (view schedule, create events)
  - Slack (send/read messages)
  - Web search
  - Database access
  - File system access
- [ ] Record their choices before proceeding

---

## Step 2: Set Up Connectors (Gmail, Google Calendar, Google Drive)

If the user wants **Gmail**:
- [ ] Walk them through `GMAIL_CONNECTOR_SETUP.md`
- [ ] This is a web-only auth flow at [claude.ai/customize/connectors](https://claude.ai/customize/connectors)
- [ ] Verify by running a test prompt: `claude -p "List my 3 most recent emails using Gmail tools"`

If the user wants **Google Calendar**:
- [ ] Direct them to [claude.ai/customize/connectors](https://claude.ai/customize/connectors) → Google Calendar → Connect
- [ ] Verify: `claude -p "What's on my calendar today?"`

If the user wants **Google Drive**:
- [ ] Direct them to [claude.ai/customize/connectors](https://claude.ai/customize/connectors) → Google Drive → Connect
- [ ] Verify: `claude -p "List my 5 most recent Google Drive files"`

---

## Step 3: Set Up MCP Servers

For each MCP server the user wants, run the appropriate `claude mcp add` command. Refer to `MCP_QUICKSTART.md` for the full list.

- [ ] Run the `claude mcp add` command for each requested server
- [ ] Verify each server is registered: `claude mcp list`
- [ ] Test each server with a simple prompt

**Example verifications:**
- Slack: `claude -p "List recent messages in #general"`
- Brave Search: `claude -p "Search the web for 'MCP protocol'"`
- PostgreSQL: `claude -p "List all tables in the database"`

---

## Step 4: Install Skills

- [ ] Copy `.claude/skills/email-replies/SKILL.md` to the user's project (if they want email capability)
- [ ] Copy `.claude/commands/reply.md` to the user's project (if they want the `/reply` command)
- [ ] Verify skills are recognized: check that they appear in the agent's available skills

---

## Step 5: Verify Everything Works

Run a test prompt for each capability to confirm it works end-to-end:

- [ ] Email: `claude -p "Read my unread emails and summarize the top 5"`
- [ ] Calendar: `claude -p "What meetings do I have this week?"`
- [ ] Slack: `claude -p "What are the latest messages in #general?"`
- [ ] Web search: `claude -p "Search the web for the latest news about AI agents"`
- [ ] Database: `claude -p "List all tables in the connected database"`

---

## Step 6: Report

- [ ] Summarize what was set up
- [ ] List each capability and its status (working / needs attention)
- [ ] Note any capabilities that require additional configuration (API keys, etc.)
- [ ] Remind the user they can add more capabilities later with `claude mcp add`
