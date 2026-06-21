# Plan of action -- upgrade this twin into a Slack bot

**Audience: the coding agent (Claude Code, Codex, or any similar agent) doing the work.** These files are ready-made -- integrate them as-is; don't rebuild the feature.
This is the ordered execution plan. The full source + token setup lives in the
guide -- open it and follow it:

- `guide for implementing slack.md`

Work top to bottom. Don't skip steps. Each step has a done-check.

---

## Goal

Turn the user's existing terminal twin into a **Slack bot, in place** -- same
brain, new face. End state: the bot replies in Slack threads in the twin's
voice, **plus** the twin can send / edit / delete Slack messages on its own via
an MCP server (or CLI fallback).

## Preconditions (verify first)

- [ ] You are inside the user's twin project (a `CLAUDE.md` / persona is present).
- [ ] `claude --version` works (Claude Code installed + logged in). If not, stop
      and tell the user to install/login first.
- [ ] An existing terminal twin file or `core.js` exists. If a `core.js` with
      `askTwin()` exists, the bot uses it directly. Otherwise, the bot falls back
      to spawning `claude -p`.

---

## Steps

### 1. Confirm it's a Node.js project with core.js

- [ ] Node.js project: `package.json` exists with `"type": "module"`.
- [ ] A `core.js` file exports `askTwin(message)`. If it doesn't exist, the bot
      will fall back to direct `claude -p` -- that's fine.
- Done when: you've confirmed it's a Node.js ESM project.

### 2. Read the existing twin's brain

- [ ] If `core.js` exists, read it. Note how `askTwin` calls `claude -p`: the
      working directory, session flags (`--session-id`/`--resume`), and any extra
      flags (`--allowedTools`, `--model`, etc.).
- [ ] If there's a separate `twin.js` / `main.js`, read that instead.
- Done when: you can list the exact flags the current twin passes (or confirm
  it uses the default `core.js` pattern).

### 3. Copy files from `files/` to project root

- [ ] Copy `files/slack-bot.js` -> `slack-bot.js` (project root)
- [ ] Copy `files/slack-mcp.js` -> `slack-mcp.js` (project root)
- [ ] Copy `files/slack-actions.js` -> `slack-actions.js` (project root, CLI fallback)
- [ ] Copy `files/.env.example` -> `.env.example` (project root)
- [ ] If Step 2 found custom flags, merge them into the `spawnClaude()` function's
      `args` array so the Slack twin behaves identically.
- [ ] Confirm `TWIN_DIR` resolves to the project root (where `CLAUDE.md` lives).
- Done when: all files exist and the bot's brain logic matches the user's twin.

### 4. Install dependencies

- [ ] `npm install @slack/bolt dotenv @modelcontextprotocol/sdk`
- Done when: deps install without error.

### 5. Slack app + tokens (USER does this -- you can't)

- [ ] Print the Slack-app steps from `SLACK_APP_SETUP.md` (create app -> Socket
      Mode -> App-Level Token `connections:write` -> bot scopes -> event
      subscriptions -> install -> bot token -> `/invite`).
- [ ] Wait for the user to paste back `SLACK_BOT_TOKEN` (xoxb-) and
      `SLACK_APP_TOKEN` (xapp-).
- Done when: the user has both tokens ready.

### 6. Create .env with tokens

- [ ] `cp .env.example .env` and fill in the user's tokens.
- [ ] Ensure `.env` is in `.gitignore`.
- Done when: `.env` exists with both tokens and won't be committed.

### 7. Add MCP server to `.mcp.json`

- [ ] Create or update `.mcp.json` in the project root:
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
- Done when: `.mcp.json` exists with the slack-actions server configured.

### 8. Optionally copy SKILL.md as fallback

- [ ] Copy `skills/slack-message/SKILL.md` from this module into the project's
      `.claude/skills/slack-message/` directory (create it if needed).
- [ ] This is optional -- the MCP server is the primary way to act on Slack.
      The skill is a CLI-based fallback for environments where MCP isn't available.
- Done when: skill file copied (or skipped if not needed).

### 9. Run & verify

- [ ] Start the bot from the project root (`node slack-bot.js`).
- [ ] Confirm the startup log prints the bot identity + twin dir.
- [ ] In Slack, `@mention` the bot; confirm it reacts with eyes and replies
      in-thread in the twin's voice; confirm a follow-up in that thread works
      without a mention.
- Done when: a real Slack message gets a correct in-voice reply.

### 10. Report

- [ ] Give the user a 3-line summary:
  1. Slack bot installed -- bot file + MCP server for outbound actions.
  2. MCP tools: `slack_send_message`, `slack_edit_message`, `slack_delete_message`, `slack_list_messages`.
  3. Start command: `node slack-bot.js`

---

## Guardrails (hold throughout)

- Upgrade in place -- never leave two `claude -p` dispatchers behind.
- Preserve the brain (flags + working dir) so replies match the terminal twin.
- Don't modify `CLAUDE.md` / persona -- the voice stays the user's.
- Never print or commit token values.
