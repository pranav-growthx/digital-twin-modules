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
- **Sends, edits & deletes too.** Beyond replying, the twin can post, edit,
  delete, and list Slack messages on its own (via `slack-actions.js` + the
  `slack-message` skill).
- **Node.js ESM.** Uses `import`/`export` and `"type": "module"`.

## How it works

```
Slack message -----> slack-bot.js -----> askTwin(message)  (from your core.js)
   (mention/DM)          |                    |  calls claude -p with your CLAUDE.md
                         |                    v
Slack thread  <---- post reply <-------- twin's answer
```

If `core.js` doesn't exist, the bot falls back to spawning `claude -p` directly
with per-thread session UUIDs for conversation continuity.

The bot is a thin bridge wrapped around your existing brain. Your twin's
personality and knowledge come entirely from the `CLAUDE.md` + handbook files in
your project -- this module adds no persona of its own. It's **neutral**: point
it at any twin and it speaks in that twin's voice.

## The fastest way to install it (recommended)

Open **Claude Code inside your twin's project folder** and paste:

```
Read PLAN_OF_ACTION.md from <this-module-path> and set up the Slack feature for my twin.
```

Or just **paste the repo link** and Claude will figure out the rest (see the
instruction block at the top of this file).

## Manual install

1. Copy the reference bot files to your project root:
   - [`node/slack-bot.js`](node/slack-bot.js) -> `slack-bot.js`
   - [`node/slack-actions.js`](node/slack-actions.js) -> `slack-actions.js`
   - [`.claude/skills/slack-message/SKILL.md`](.claude/skills/slack-message/SKILL.md)
     -> `.claude/skills/slack-message/SKILL.md`
2. Create the Slack app and get two tokens -- see
   **[`SLACK_APP_SETUP.md`](SLACK_APP_SETUP.md)**.
3. `cp node/.env.example .env` and paste your tokens in.
4. Install deps and run: `npm install @slack/bolt dotenv && node slack-bot.js`
5. In Slack, `@mention` the bot or DM it.

## Files

| Path                                       | What it is                                   |
| ------------------------------------------ | -------------------------------------------- |
| `PLAN_OF_ACTION.md`                        | Ordered execution checklist (Claude/Codex)   |
| `guide for implementing slack.md`          | Paste-into-Claude guide -- Node.js twin      |
| `SLACK_APP_SETUP.md`                       | One-time Slack app creation (scopes, tokens) |
| `.claude/skills/slack-message/SKILL.md`    | Teaches the twin to send/edit/delete/list    |
| `node/slack-bot.js`                        | Reference bot with state machine + gating    |
| `node/slack-actions.js`                    | CLI for send/edit/delete/list                |
| `node/package.json`                        | Dependencies (ESM, @slack/bolt, dotenv)      |
| `node/.env.example`                        | Token template                               |
