# MCP Quickstart

A quick reference for adding capabilities to your digital twin via MCP (Model Context Protocol).

---

## What Is MCP?

MCP (Model Context Protocol) is an open standard that lets AI agents discover and use tools. An MCP server is a small program that exposes tools — things like "search emails," "query database," or "send Slack message." When your twin (`claude -p`) connects to an MCP server, those tools become available for the agent to use. Think of MCP servers as plugins for your twin.

---

## Adding an MCP Server (CLI)

The fastest way to add an MCP server:

```bash
claude mcp add <name> npx <npm-package>
```

**`<name>`** is what you want to call the server (your choice).
**`<npm-package>`** is the npm package that runs the server.

Example:

```bash
claude mcp add slack npx @anthropic/slack-mcp-server
```

This tells Claude: "There's an MCP server called 'slack'. To start it, run `npx @anthropic/slack-mcp-server`."

---

## Adding an MCP Server (`.mcp.json`)

For reproducible configurations, create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["package-name"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

Full example with multiple servers:

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
        "BRAVE_API_KEY": "your-key"
      }
    }
  }
}
```

---

## Verifying Your Servers

List all registered MCP servers:

```bash
claude mcp list
```

Test a specific server by asking the agent to use it:

```bash
claude -p "Use Slack tools to list channels I'm in"
```

---

## Common MCP Servers

| Name | Package | What It Does | Notes |
|---|---|---|---|
| **Slack** | `@anthropic/slack-mcp-server` | Send/read Slack messages, list channels | Needs `SLACK_BOT_TOKEN` |
| **Brave Search** | `@anthropic/brave-search-mcp-server` | Web search via Brave | Needs `BRAVE_API_KEY` |
| **Tavily** | `tavily-mcp-server` | Web search via Tavily | Needs `TAVILY_API_KEY` |
| **PostgreSQL** | `@anthropic/postgres-mcp-server` | Query PostgreSQL databases | Pass connection string as arg |
| **MongoDB** | `mongodb-mcp-server` | Query MongoDB databases | Pass `--connectionString` |
| **Filesystem** | `@anthropic/filesystem-mcp-server` | Read/write files in a directory | Pass directory path as arg |
| **GitHub** | `@anthropic/github-mcp-server` | Issues, PRs, repos | Needs `GITHUB_TOKEN` |
| **Sentry** | `@sentry/mcp-server` | Error tracking, issue search | Needs Sentry auth token |

---

## Writing a Custom MCP Server

If you need a tool that no existing package provides, you can write your own MCP server. Here's a minimal example using the official SDK.

### Setup

```bash
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk
```

Set `"type": "module"` in `package.json` (for ESM).

### Minimal Server (`index.js`)

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-tools",
  version: "1.0.0",
});

// Define a tool
server.tool(
  "get_weather",
  "Get the current weather for a city",
  {
    city: z.string().describe("City name"),
  },
  async ({ city }) => {
    // Replace with real API call
    return {
      content: [
        {
          type: "text",
          text: `The weather in ${city} is sunny, 24°C.`,
        },
      ],
    };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Register It

```bash
claude mcp add my-tools node /absolute/path/to/my-mcp-server/index.js
```

### Test It

```bash
claude -p "What's the weather in Mumbai?"
```

---

## Tips

- **npx handles installation.** You don't need to `npm install` MCP packages globally — `npx` downloads and runs them automatically.
- **Environment variables for secrets.** Never hardcode API keys. Use env vars in `.mcp.json` or set them in your shell before running `claude mcp add`.
- **One server per concern.** Don't cram everything into one MCP server. Keep servers focused — one for Slack, one for search, one for your database.
- **Check for existing servers first.** Before writing a custom server, search npm for `mcp-server` — there are hundreds of community packages.
