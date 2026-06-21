---
name: slack-message
description: Send, edit, delete, or list Slack messages on the user's behalf. Trigger whenever the user asks to post/send a Slack message, edit/update a message already sent, delete/remove a message, or look up recent messages in a channel.
---

# Act on Slack (send / edit / delete / list)

Use the MCP tools provided by the `slack-actions` server. The bot can only
**edit or delete messages it posted itself.**

## MCP Tools

| Tool | What it does |
|---|---|
| `slack_send_message` | Post a message to a channel or DM. Returns the message `ts` — save it. |
| `slack_edit_message` | Edit a message the bot sent (needs `channel` + `ts`). |
| `slack_delete_message` | Delete a message the bot sent (needs `channel` + `ts`). |
| `slack_list_messages` | List recent messages in a channel (to find a `ts`). |

`channel` is a channel ID (e.g. `C0123ABC`) or a user ID (e.g. `U0123ABC`) for
a DM.

## How to handle common requests

- **"Send X to #channel"** — call `slack_send_message`. Save the `ts` it returns.
- **"Edit / change that message"** — if you have the `ts` from a recent send, use
  `slack_edit_message`. Otherwise call `slack_list_messages` to find the bot's
  message first.
- **"Delete that message"** — call `slack_list_messages` to find it, then
  `slack_delete_message`. Confirm before deleting if ambiguous.

Keep wording in the agent's voice (from `PERSONA.md`) unless the user gave
exact text to send.

## Fallback (if MCP tools aren't available)

Use the CLI via Bash:
```
node slack-actions.js send   <channel> <text...>
node slack-actions.js edit   <channel> <ts> <new text...>
node slack-actions.js delete <channel> <ts>
node slack-actions.js list   <channel> [limit]
```
