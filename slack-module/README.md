# Twin Slack Module

> ## If you are Claude Code or Codex (any coding agent), read this first
>
> **Ready-made -- don't rebuild anything.** You do **not** need to write or
> reinvent this feature. Just install/wire in the files as described and the bot
> gains the capability. These files work the same with Claude Code or Codex.
>
> The user pasted this repo because they want to **add Slack to their existing
> twin** (same brain -- `askTwin()` from `core.js` -- new face: Slack).
> Do this, in order:
>
> 1. **Follow `PLAN_OF_ACTION.md`** -- the ordered execution checklist (works for
>    Claude *or* Codex). It tells you exactly what to do and links to the code.
> 2. **Confirm it's a Node.js ESM project** (a `core.js`, `package.json` with
>    `"type": "module"`). This module is for Node.js ESM twins.
> 3. **Read the guide** for the full steps:
>    - `guide for implementing slack.md`
> 4. The plan + guide tell you to **copy the bot files**, install deps, and walk
>    the user through creating the Slack app + tokens. Follow them exactly.
>
> Everything below is human-facing context.

---

**Put your terminal twin on Slack.** Your existing twin (the one with `core.js`
that exports `askTwin()`) gets a Slack front-end -- same brain, new face. People
@mention or DM it in Slack, and your twin replies in its own voice -- using your
`CLAUDE.md` and handbook -- right inside the thread.

- **No API key.** It dispatches through your `askTwin()` (which calls `claude -p`
  against your logged-in Claude Code session), exactly like your terminal twin.
- **No server / no public URL.** Uses Slack **Socket Mode**.
- **Per-thread memory.** Each Slack thread keeps its own Claude session.
- **State machine.** Idle/busy/draining prevents double-responses. Messages
  that arrive while the agent is busy are buffered and drained together.
- **Attention gating.** When humans are talking to each other without @mentioning
  the bot, it goes dormant automatically. @mention to wake it.
- **Thread commands.** `!cancel`, `!reset`, `!status` for thread management.
- **MCP server for outbound actions.** The twin can send, edit, delete, and list
  Slack messages via the `slack-mcp.js` MCP server -- no CLI needed.
- **CLI fallback.** `slack-actions.js` is a standalone CLI for environments where
  MCP isn't available.
- **Node.js ESM.** Uses `import`/`export` and `"type": "module"`.

## Architecture

There are two separate pieces:

**Inbound (slack-bot.js)** -- the platform adapter. Listens for Slack messages
(mentions, DMs, thread replies), calls `askTwin()` from `core.js`, and posts
the reply back into the thread. This is a long-running process, not an MCP
server.

**Outbound (slack-mcp.js)** -- the MCP server. Exposes `slack_send_message`,
`slack_edit_message`, `slack_delete_message`, and `slack_list_messages` as MCP
tools so the agent can act on Slack proactively (e.g. "post standup in 5 to
#general"). Runs as a stdio MCP server launched by `.mcp.json`.

```
Inbound:
  Slack message -----> slack-bot.js -----> askTwin(message)
     (mention/DM)          |                    |  calls claude -p
                           |                    v
  Slack thread  <---- post reply <-------- twin's answer

Outbound:
  Agent -----> slack-mcp.js (MCP) -----> Slack API
     (send/edit/delete/list)                |
                                            v
  Agent  <---- result (ts, messages) <---- Slack
```

Both use `SLACK_BOT_TOKEN` from `.env`.

## The fastest way to install it (recommended)

Open **Claude Code inside your twin's project folder** and paste:

```
Read PLAN_OF_ACTION.md from <this-module-path> and set up the Slack feature for my twin.
```

Or just **paste the repo link** and Claude will figure out the rest (see the
instruction block at the top of this file).

## Manual install

1. Copy the files from `files/` to your project root:
   - `files/slack-bot.js` -> `slack-bot.js`
   - `files/slack-mcp.js` -> `slack-mcp.js`
   - `files/slack-actions.js` -> `slack-actions.js` (optional CLI fallback)
   - `files/.env.example` -> `.env.example`
2. Create the Slack app and get two tokens -- see
   **[`SLACK_APP_SETUP.md`](SLACK_APP_SETUP.md)**.
3. `cp .env.example .env` and paste your tokens in.
4. Install deps: `npm install @slack/bolt dotenv @modelcontextprotocol/sdk`
5. Add the MCP server to `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "slack-actions": {
         "command": "node",
         "args": ["slack-mcp.js"],
         "env": {
           "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}"
         }
       }
     }
   }
   ```
6. Start the bot: `node slack-bot.js`
7. In Slack, `@mention` the bot or DM it.

## Files

| Path                                  | What it is                                   |
| ------------------------------------- | -------------------------------------------- |
| `PLAN_OF_ACTION.md`                   | Ordered execution checklist (Claude/Codex)   |
| `guide for implementing slack.md`     | Paste-into-Claude guide -- Node.js twin      |
| `SLACK_APP_SETUP.md`                  | One-time Slack app creation (scopes, tokens) |
| `skills/slack-message/SKILL.md`       | CLI fallback skill for send/edit/delete/list |
| `files/slack-bot.js`                  | Inbound: platform adapter (Socket Mode bot)  |
| `files/slack-mcp.js`                  | Outbound: MCP server for send/edit/delete    |
| `files/slack-actions.js`              | Outbound: standalone CLI fallback            |
| `files/.env.example`                  | Token template                               |
| `deps.txt`                            | npm dependencies to install                  |
