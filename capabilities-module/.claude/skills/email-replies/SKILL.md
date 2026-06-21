---
name: email-replies
description: >-
  Read the user's unread Gmail and draft replies in the agent's own voice, saved to a single file.
  Trigger this whenever the user asks to read their email/inbox and draft, write, or prepare replies to their mail.
---

## Instructions

1. **Fetch unread emails** using Gmail tools. Retrieve up to 15 unread emails, newest first.

2. **Filter out noise.** Skip emails that are:
   - From no-reply or noreply addresses
   - Marketing emails, newsletters, or promotional content
   - Automated notifications (GitHub, CI/CD, alerts, billing)
   - Mailing list digests
   
   Only draft replies to emails from **real humans** that warrant a response.

3. **Read the agent's voice.** Before drafting any reply, read `CLAUDE.md` and `PERSONA.md` (if it exists) to understand the user's communication style, tone, and preferences. Every reply must sound like it comes from the user, not from a generic assistant.

4. **Draft each reply.** For each email that warrants a response:
   - Write the reply in the agent's voice (as established from CLAUDE.md/PERSONA.md)
   - Keep replies concise and natural
   - If a factual detail is needed but unknown (dates, numbers, names, specifics), use a `[bracketed placeholder]` — e.g., `[confirm meeting time]`, `[insert project name]`
   - Match the formality level of the incoming email

5. **Save all drafts to a single file.** Write all drafts to:
   ```
   drafts/replies-<YYYY-MM-DD>.md
   ```
   Format each entry as:
   ```markdown
   ## Reply to: <sender name> (<sender email>)
   **Subject:** <original subject>
   **Received:** <date/time>
   
   ---
   
   <draft reply text>
   
   ---
   ```

6. **Report.** When finished, tell the user:
   > Drafted N replies → drafts/replies-<YYYY-MM-DD>.md

## Safety Rules

- **NEVER send any email.** All drafts are saved locally. Never use any tool that sends, forwards, or replies to email.
- **NEVER mark emails as read.** Do not change the read/unread status of any email.
- **NEVER modify or delete any email.** This is a read-only operation.
- If Gmail tools are not available, tell the user to set up the Gmail connector (see `GMAIL_CONNECTOR_SETUP.md`) and stop.
