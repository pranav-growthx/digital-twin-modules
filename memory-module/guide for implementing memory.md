# Guide for Implementing the Memory Module

Paste this entire file into Claude Code to have it integrate the memory module into your twin project.

---

You are Claude Code. You are upgrading a digital twin's memory system from a flat `memory.json` file to a proper SQLite + FTS5 full-text search engine with MCP integration. The twin currently has a `core.js` that exports `recallContext(query)` and `remember(content)`. You will replace those with better implementations that use SQLite, and add an MCP server so the agent can use memory tools directly.

## Step 1: Install dependencies

```bash
npm install better-sqlite3 @modelcontextprotocol/sdk
```

## Step 2: Copy files

Copy all four JS files from the module's `files/` directory into the project root:

```bash
cp /path/to/memory-module/files/memory-store.js ./
cp /path/to/memory-module/files/memory.js ./
cp /path/to/memory-module/files/memory-cli.js ./
cp /path/to/memory-module/files/memory-mcp.js ./
```

## Step 3: Configure MCP server

Create or update `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["memory-mcp.js"]
    }
  }
}
```

This makes the following tools available to Claude Code:
- `memory_recall` — Search memory for relevant past context
- `memory_remember` — Save something to memory
- `memory_add_fact` — Store a curated fact (higher recall priority)
- `memory_add_lesson` — Store a lesson with "applies when" context
- `memory_stats` — Get memory statistics
- `memory_consolidate` — Run maintenance (archive stale, clean up)

## Step 4: Wire into the twin's dispatch

Find the file that imports `recallContext` and `remember` from `core.js` and change the import:

```javascript
// Replace this:
import { recallContext, remember } from "./core.js";

// With this:
import { recallContext, remember } from "./memory.js";
```

The function signatures are identical — the dispatch loop continues to work unchanged. The MCP tools provide a separate, richer interface for the agent to use directly.

## Step 5: Migrate existing memory.json

If you have a `memory.json` with existing data, run this one-time migration:

```javascript
import { readFileSync } from "fs";
import { store } from "./memory.js";

const data = JSON.parse(readFileSync("./memory.json", "utf-8"));
for (const entry of data) {
  store.remember(entry.content || entry.text || JSON.stringify(entry), {
    importance: entry.importance ?? 0.5,
  });
}
console.log(`Migrated ${data.length} memories.`);
```

## Step 6: Update .gitignore

Add these lines:

```
data/*.db
data/*.db-wal
data/*.db-shm
```

## Step 7: Verify

```bash
# Via CLI
node memory-cli.js remember "The user prefers dark mode and concise answers"
node memory-cli.js recall "user preferences"
node memory-cli.js stats
```

Confirm the recall returns the stored memory.

The MCP tools will be available in the next Claude Code session after `.mcp.json` is configured.

## Step 8: Report

When done, report:
1. Replaced flat-file memory with SQLite + FTS5 full-text search
2. Added MCP server with 6 memory tools for direct agent access
3. Same wrapper interface (recallContext/remember) for core dispatch compatibility
