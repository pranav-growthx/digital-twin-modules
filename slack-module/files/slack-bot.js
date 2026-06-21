// slack-bot.js — Slack platform adapter for your digital twin.
//
// Turns your terminal twin into a Slack bot. Same brain (askTwin from core.js,
// or direct claude -p fallback), new face (Slack Socket Mode).
//
// Architecture (derived from Junior):
//   - Per-thread sessions: each Slack thread gets its own Claude --session UUID
//   - State machine per thread: idle -> busy -> draining -> idle
//   - Buffer-drain: queues messages while agent is busy, drains on completion
//   - Attention gating: auto-dormant when humans talk without @mentioning
//   - spawn() with streaming, timeout, kill (never execSync)
//
// Run:  node slack-bot.js   (after `npm install` and filling in .env)

import "dotenv/config";
import pkg from "@slack/bolt";
const { App } = pkg;
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ──────────────────────────────────────────────────────────────────

// Where YOUR twin lives. claude -p runs here so it loads your CLAUDE.md,
// PERSONA.md, .mcp.json, and any skills. Defaults to the directory where
// this file lives (the project root, since PLAN_OF_ACTION copies it there).
const TWIN_DIR = process.env.TWIN_DIR
  ? path.resolve(process.env.TWIN_DIR)
  : __dirname;

// How long to let one Claude turn run before giving up (ms).
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 300_000);

// Slack messages cap around 4000 chars; split below that to be safe.
const SLACK_CHUNK = 3500;

// ── NOTE on askTwin ─────────────────────────────────────────────────────────
//
// We intentionally do NOT import askTwin from core.js here. The participant's
// askTwin uses execSync("claude -p --session ...") which:
//   1. Does NOT include --permission-mode bypassPermissions (so MCP tool calls
//      hang with no terminal to approve them)
//   2. Blocks the event loop (execSync), preventing concurrent message handling
//
// Instead we use spawnClaude() which has bypassPermissions, async spawn(),
// per-thread sessions, timeout, and proper error handling.
// The participant's core.js brain logic (persona, session) is still used
// because claude -p runs in TWIN_DIR and loads their PERSONA.md/CLAUDE.md.

// ── Per-thread session state ────────────────────────────────────────────────
//
// Each Slack thread gets its own session with:
//   - A UUID for Claude --session continuity
//   - A state machine: idle | busy | draining
//   - A buffer for messages that arrive while the agent is busy
//   - Human participant tracking for attention gating
//   - Dormancy state for auto-quiet behavior

/** @typedef {"idle" | "busy" | "draining"} SessionStatus */

/**
 * @typedef {Object} ThreadSession
 * @property {string} id - UUID for Claude --session
 * @property {boolean} started - Whether the session has had its first turn
 * @property {SessionStatus} status - Current state machine state
 * @property {Array<{user: string, text: string}>} pending - Buffered messages
 * @property {string[]} humanParticipants - User IDs of humans in the thread
 * @property {boolean} dormant - Auto-dormant when humans are chatting
 * @property {boolean} dormantAnnounced - One-shot announcement flag
 * @property {AbortController|null} controller - For killing the current spawn
 */

const threadSessions = new Map();

function sessionFor(threadId) {
  let s = threadSessions.get(threadId);
  if (!s) {
    s = {
      id: randomUUID(),
      started: false,
      status: "idle",
      pending: [],
      humanParticipants: [],
      dormant: false,
      dormantAnnounced: false,
      dormantNotified: false,
      controller: null,
    };
    threadSessions.set(threadId, s);
  }
  return s;
}

// ── Attention gating ────────────────────────────────────────────────────────
//
// When two humans are talking in a thread without @mentioning the bot,
// go dormant automatically. Wake on @mention.

/**
 * Returns true if the message should be dropped (consumed by the gate).
 * Returns false if normal routing should continue.
 */
function gateAttention(threadId, userId, mentionsBot, isSelfBot) {
  const session = threadSessions.get(threadId);
  if (!session) return false;

  // Ignore bot messages for gating purposes
  if (isSelfBot) return false;

  // @mention wakes a dormant thread, then falls through so the message
  // is processed normally.
  if (mentionsBot && session.dormant) {
    session.dormant = false;
    return false;
  }

  // Dormant after the wake check: drop silently
  if (session.dormant) return true;

  // Track human participants
  if (!session.humanParticipants.includes(userId)) {
    session.humanParticipants.push(userId);
  }

  // Auto-dormant trigger: a second human posts without @mentioning.
  // Only fires once per thread (dormantAnnounced is sticky).
  if (!session.dormantAnnounced && !mentionsBot) {
    const otherHumans = session.humanParticipants.filter((u) => u !== userId);
    if (otherHumans.length > 0) {
      session.dormant = true;
      session.dormantAnnounced = true;
      return true; // caller should post the dormancy notice
    }
  }

  return false;
}

// ── Dispatch one message to the twin ────────────────────────────────────────

/**
 * Ask the twin a question by spawning claude -p with per-thread sessions,
 * bypassPermissions (so MCP tools work unattended), and timeout.
 */
async function dispatchToTwin(threadId, message) {
  return spawnClaude(threadId, message);
}

function spawnClaude(threadId, message) {
  return new Promise((resolve) => {
    const session = sessionFor(threadId);
    const sessionFlag = session.started
      ? ["--resume", session.id]
      : ["--session-id", session.id];
    session.started = true;

    const args = [
      "-p",
      message,
      ...sessionFlag,
      "--permission-mode",
      "bypassPermissions",
    ];

    const child = spawn("claude", args, {
      cwd: TWIN_DIR,
      env: process.env,
    });

    // Track the child for cancellation
    session.controller = { kill: () => child.kill("SIGKILL") };

    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve("(the twin took too long and was stopped)");
    }, CLAUDE_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      session.controller = null;
      if (code !== 0) {
        console.error("[claude] exit", code, err);
        resolve("(the twin hit an error -- check the bot's logs)");
        return;
      }
      resolve(out.trim() || "(the twin had nothing to say)");
    });

    child.on("error", (e) => {
      clearTimeout(timer);
      session.controller = null;
      console.error("[claude] spawn failed:", e.message);
      resolve(
        "(couldn't start `claude` -- is Claude Code installed and logged in?)"
      );
    });
  });
}

// ── Message chunking ────────────────────────────────────────────────────────

function chunk(text) {
  if (text.length <= SLACK_CHUNK) return [text];
  const parts = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if ((buf + "\n" + line).length > SLACK_CHUNK && buf) {
      parts.push(buf);
      buf = "";
    }
    buf = buf ? buf + "\n" + line : line;
  }
  if (buf) parts.push(buf);
  return parts;
}

// ── Thread commands ─────────────────────────────────────────────────────────

function parseCommand(text) {
  const match = text.match(/^!(\w+)(?:\s+(.*))?$/s);
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: (match[2] || "").trim() };
}

function handleCommand(threadId, command) {
  const session = sessionFor(threadId);

  switch (command.name) {
    case "cancel": {
      if (session.controller) {
        session.controller.kill();
        session.controller = null;
      }
      session.status = "idle";
      session.pending = [];
      return "Cancelled.";
    }
    case "reset": {
      if (session.controller) {
        session.controller.kill();
        session.controller = null;
      }
      threadSessions.delete(threadId);
      return "Session reset. Next message starts fresh.";
    }
    case "status": {
      const pending = session.pending.length;
      return [
        `*Status:* ${session.status}`,
        `*Session:* ${session.id.slice(0, 8)}...`,
        `*Dormant:* ${session.dormant ? "yes" : "no"}`,
        `*Pending messages:* ${pending}`,
      ].join("\n");
    }
    default:
      return null; // unknown command, pass through as regular message
  }
}

// ── Core message handler with state machine ─────────────────────────────────

async function processMessage({ text, channel, threadId, say, client, userId }) {
  const clean = text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!clean) return;

  // Check for thread commands
  const command = parseCommand(clean);
  if (command) {
    const response = handleCommand(threadId, command);
    if (response) {
      await say({ text: response, thread_ts: threadId });
      return;
    }
    // Unknown command falls through as regular message
  }

  const session = sessionFor(threadId);

  console.log(
    `[slack] thread=${threadId} status=${session.status} msg="${clean.slice(0, 80)}"`
  );

  // State machine: if busy, buffer the message
  if (session.status === "busy" || session.status === "draining") {
    session.pending.push({ user: userId, text: clean });
    console.log(
      `[slack] buffered (${session.pending.length} pending) thread=${threadId}`
    );
    // React with eyes to acknowledge
    try {
      await client.reactions.add({
        channel,
        name: "eyes",
        timestamp: threadId,
      });
    } catch (_) {}
    return;
  }

  // Transition: idle -> busy
  session.status = "busy";

  // React with eyes: "I'm on it"
  try {
    await client.reactions.add({
      channel,
      name: "eyes",
      timestamp: threadId,
    });
  } catch (_) {}

  const reply = await dispatchToTwin(threadId, clean);
  for (const part of chunk(reply)) {
    await say({ text: part, thread_ts: threadId });
  }

  // Drain: if messages arrived while we were busy, combine and process
  if (session.pending.length > 0) {
    session.status = "draining";
    const combined = session.pending
      .map((m) => `[${m.user}]: ${m.text}`)
      .join("\n");
    session.pending = [];

    console.log(`[slack] draining buffered messages thread=${threadId}`);
    const drainReply = await dispatchToTwin(threadId, combined);
    for (const part of chunk(drainReply)) {
      await say({ text: part, thread_ts: threadId });
    }

    // Check if MORE messages arrived during drain
    while (session.pending.length > 0) {
      const moreCombined = session.pending
        .map((m) => `[${m.user}]: ${m.text}`)
        .join("\n");
      session.pending = [];
      const moreReply = await dispatchToTwin(threadId, moreCombined);
      for (const part of chunk(moreReply)) {
        await say({ text: part, thread_ts: threadId });
      }
    }
  }

  // Transition: -> idle
  session.status = "idle";
}

// ── Slack wiring ────────────────────────────────────────────────────────────

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

let selfUserId = null;

// 1) @mentions in a channel — always respond
app.event("app_mention", async ({ event, say, client }) => {
  // Ignore bots
  if (event.bot_id) return;

  const threadId = event.thread_ts || event.ts;
  const session = sessionFor(threadId);

  // @mention always wakes dormancy
  if (session.dormant) {
    session.dormant = false;
  }

  // Track human participant
  if (event.user && !session.humanParticipants.includes(event.user)) {
    session.humanParticipants.push(event.user);
  }

  await processMessage({
    text: event.text,
    channel: event.channel,
    threadId,
    say,
    client,
    userId: event.user,
  });
});

// 2) DMs, and thread replies in threads the bot is already part of
app.event("message", async ({ event, say, client }) => {
  // Ignore bots (including ourselves), edits, joins, etc.
  if (event.bot_id || event.subtype) return;
  if (event.user && event.user === selfUserId) return;

  const isDM = event.channel_type === "im";
  const threadId = event.thread_ts || event.ts;
  const isFollowUp = event.thread_ts && threadSessions.has(event.thread_ts);
  const mentionsBot =
    selfUserId && event.text && event.text.includes(`<@${selfUserId}>`);

  // In channels we only start on an @mention (handled by app_mention above).
  // Here we handle DMs and follow-ups inside threads the bot already owns.
  if (!isDM && !isFollowUp) return;

  // Attention gating: if humans are talking without @mentioning, go dormant
  if (!isDM && isFollowUp) {
    const shouldDrop = gateAttention(
      threadId,
      event.user,
      mentionsBot,
      false
    );
    if (shouldDrop) {
      // If this was the dormancy trigger, post the one-time notice
      const session = threadSessions.get(threadId);
      if (session && session.dormant && !session.dormantNotified) {
        session.dormantNotified = true;
        await say({
          text: "Looks like you're talking to each other -- I'll stay quiet. @mention me or say `!status` to bring me back.",
          thread_ts: threadId,
        });
      }
      return;
    }
  }

  await processMessage({
    text: event.text,
    channel: event.channel,
    threadId,
    say,
    client,
    userId: event.user,
  });
});

// ── Startup ─────────────────────────────────────────────────────────────────

(async () => {
  await app.start();
  const auth = await app.client.auth.test();
  selfUserId = auth.user_id;

  // Auto-start scheduler if present (cronjobs module integration)
  try {
    const s = await import("./scheduler.js");
    s.startScheduler?.();
  } catch (_) {}

  console.log(`Twin Slack bot is running as @${auth.user} (${selfUserId})`);
  console.log(`   twin dir: ${TWIN_DIR}`);
})();
