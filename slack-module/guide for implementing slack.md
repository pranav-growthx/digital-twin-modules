# Guide: upgrade your twin into a Slack bot (Node.js)

**You are Claude Code or Codex (or any coding agent), reading this file inside the user's twin project.** These files are ready-made -- don't rebuild the feature from scratch; just install/wire them in as described below. The
user already has a terminal twin -- a Node file with a `core.js` that exports
`askTwin()`. Your job is to **add the Slack face**: same brain, new platform.

> This module is for **Node.js ESM** twins (`"type": "module"` in `package.json`).

---

## The prompt the user pastes (for reference)

> Read `PLAN_OF_ACTION.md` from this module and set up the Slack feature for my twin.

---

## How it works

- **The brain stays the same** -- the bot imports `askTwin()` from `core.js`.
  If `core.js` doesn't exist, it falls back to spawning `claude -p` directly
  with per-thread session continuity.
- **The face is Slack** -- Socket Mode (no public URL needed). DMs, @mentions,
  and thread follow-ups.
- **Per-thread memory** -- each Slack thread gets its own Claude session UUID.
- **State machine** -- idle/busy/draining prevents double-responses. Messages
  that arrive while the agent is busy are buffered and drained as one combined
  prompt when the current turn finishes.
- **Attention gating** -- when two humans are talking in a thread without
  @mentioning the bot, it goes dormant. @mention to wake it.
- **Thread commands** -- `!cancel`, `!reset`, `!status` for thread management.

---

## Step 0 -- Read the existing twin

1. Find the user's `core.js`. It should export `askTwin(message)`.
2. If it exists, note how it calls `claude -p` -- the working directory,
   session flags, and any extra flags. The bot will import and call it directly.
3. If there's no `core.js`, the bot falls back to spawning `claude -p` with
   the same pattern -- that's fine.

---

## Step 1 -- Copy `slack-bot.js` to the project root

Copy `slack-bot.js` from this module's `node/` folder into the project **root**
(next to `CLAUDE.md`). This is the canonical bot with:

- ESM imports (`import`/`export`)
- `askTwin()` import from `core.js` with fallback
- Per-thread session UUIDs for Claude `--session` continuity
- State machine (idle/busy/draining) for buffer-drain
- Attention gating (auto-dormant when humans chat without @mention)
- Thread commands (`!cancel`, `!reset`, `!status`)
- `spawn()` with streaming, timeout, kill
- Message chunking for Slack's ~4000 char limit
- Auto-starts `scheduler.js` if present (cronjobs module integration)

If Step 0 found custom flags in the user's `core.js`, they're already handled
since the bot calls `askTwin()` directly. If using the fallback path, merge
any custom flags into the `spawnClaude()` function's `args` array.

---

## Step 2 -- Dependencies

Add the two libraries the Slack face needs:

```
npm install @slack/bolt dotenv
```

(If there's no `package.json`, create one with `npm init -y` and add
`"type": "module"` to it.)

---

## Step 3 -- Slack app + tokens (have the USER do this)

You (Claude) **cannot** create the Slack app -- it needs a human in a browser.
Print these steps and wait for the user to paste back the two tokens. Socket
Mode means no public URL is needed.

1. <https://api.slack.com/apps> -> **Create New App** -> **From scratch**; name
   it, pick the workspace.
2. **Socket Mode** -> enable. Generate an **App-Level Token** with scope
   `connections:write`. Copy it -> `SLACK_APP_TOKEN` (starts `xapp-`).
3. **OAuth & Permissions** -> **Bot Token Scopes**, add: `app_mentions:read`,
   `chat:write`, `im:history`, `channels:history`, `groups:history`,
   `reactions:write`.
4. **Event Subscriptions** -> enable -> **Subscribe to bot events**:
   `app_mention`, `message.im`, `message.channels`, `message.groups`.
5. **Install App** -> **Install to Workspace** -> **Allow**. Copy the **Bot User
   OAuth Token** -> `SLACK_BOT_TOKEN` (starts `xoxb-`).
6. In Slack: `/invite @YourBotName` into a channel (DMs need no invite).

Then create `.env` in the project root (and make sure `.env` is git-ignored):

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
# Optional: TWIN_DIR=/abs/path/to/twin   (default = parent of this module)
# Optional: CLAUDE_TIMEOUT_MS=300000
```

---

## Step 4 -- Run & verify

1. Confirm Claude Code is installed/logged in: `claude --version`. If it fails,
   tell the user to install/login first.
2. Start the bot from the project root: `node slack-bot.js` (or `npm start`).
3. Expect: `Twin Slack bot running as @... -- twin dir: ...`.
4. In Slack, `@mention` the bot in the invited channel (`@YourBot say hi`).
   Within seconds it should react with eyes and reply in a thread, in the
   twin's voice. Follow-ups inside that thread don't need another mention.

---

## Step 5 -- Outbound actions: send / edit / delete messages

The bot above *replies* to people. To also let the twin **send, edit, delete,
and list** Slack messages on its own (e.g. "post 'standup in 5' to #general",
"delete that last message"), install the actions CLI + a skill.

**5a. Copy `slack-actions.js`** from this module's `node/` folder to the project
root -- a CLI for `send` / `edit` / `delete` / `list`.

**5b. Copy `.claude/skills/slack-message/SKILL.md`** from this module into the
project's `.claude/skills/slack-message/` directory so the twin knows it has
these powers and calls the CLI via Bash.

**5c.** No new scopes needed: `chat:write` covers send/edit/delete of the bot's
own messages; `*:history` covers `list` (both already added in Step 3).

---

## Guardrails (do these, quietly)

- **Upgrade in place -- don't duplicate.** If there was an old terminal twin,
  remove it. End with one app file (`slack-bot.js`), not two dispatchers.
- **Preserve the brain.** The bot imports `askTwin()` from `core.js` -- don't
  modify `core.js` or the user's `claude -p` dispatch logic.
- **Don't touch** `CLAUDE.md`, the persona/handbook, or other source -- the
  personality stays 100% the user's. This bot adds no voice of its own.
- **Never print or commit token values.** Ensure `.env` is git-ignored.
- If `claude -p` isn't found at runtime, it's almost always Claude Code not being
  installed / on PATH for the shell that launched the bot.

When finished, give the user a 3-line summary: that the Slack bot was installed,
that you added send/edit/delete via `slack-actions.js` + the `slack-message`
skill, and the exact command to start the bot.
