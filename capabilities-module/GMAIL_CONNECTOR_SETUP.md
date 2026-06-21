# Gmail Connector Setup

This guide walks you through connecting Gmail to your digital twin using Claude's built-in connector system. This is a **web-only** authentication flow — you do not run any commands in the terminal.

---

## Step-by-Step

### 1. Open the Connectors Page

Go to [claude.ai/customize/connectors](https://claude.ai/customize/connectors) in your browser.

You must be signed in to your Claude account.

### 2. Find Gmail and Connect

- Locate **Gmail** in the list of available connectors
- Click the **Connect** button next to it

### 3. Sign In to Google

- A Google sign-in window will appear
- Sign in with the Google account whose email you want your twin to read
- If you have multiple Google accounts, make sure you select the right one

### 4. Allow Read Access

- Google will ask you to grant Claude permission to read your email
- Review the permissions carefully — Claude requests **read-only** access
- Click **Allow** to grant access

### 5. Confirm Connected

- You should be redirected back to the connectors page
- Gmail should now show as **Connected**
- The connection is complete

---

## Important Notes

### This Is Not a Terminal MCP Server

The Gmail connector is **not** added via `claude mcp add` in the terminal. It uses a separate web-based authentication flow through claude.ai. The `mcp__claude_ai_Gmail__*` tools only become available after completing the web auth flow above.

### Read-Only Access

- Your twin can **read** your email — it cannot send, delete, or modify emails
- All reply drafts are saved to **local files**, never sent through Gmail
- Your twin will never mark emails as read or move them to folders

### Privacy

- Email data is processed through Claude's API according to Anthropic's privacy policy
- Drafts created by your twin are saved locally on your machine
- No email content is stored permanently by Claude

---

## Verification

After connecting, verify the setup works:

```bash
claude -p "Use Gmail tools to list my 3 most recent emails. Show the subject and sender for each."
```

If you see email data returned, the connector is working correctly.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Gmail not showing in connectors list | Make sure you're signed in to claude.ai and refresh the page |
| "Authentication required" error in claude -p | Go back to [claude.ai/customize/connectors](https://claude.ai/customize/connectors) and reconnect Gmail |
| Wrong Gmail account connected | Disconnect Gmail on the connectors page, then reconnect with the correct account |
| Tools not appearing after connecting | Wait a moment and try again — connector registration can take a few seconds |
