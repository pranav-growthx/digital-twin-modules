<!--
CLAUDE CODE INSTRUCTION BLOCK
If you are Claude Code reading this file: this module replaces a twin's
recallContext and remember functions with SQLite + FTS5 backed implementations,
and adds an MCP server so the agent can use memory tools directly.
Copy the files from files/ into the twin project, install deps, and configure .mcp.json.
Do NOT rewrite the twin's core.js — this is additive.
-->

# Memory Module

Upgrades a digital twin's simple `memory.json` to a proper memory engine backed by **SQLite + FTS5 full-text search**. Provides both a drop-in wrapper (same API as core.js) and an **MCP server** for direct agent tool access.

## How It Works

```
Agent uses MCP tools directly          Twin dispatch calls recallContext/remember
(memory_recall, memory_remember, …)    (drop-in replacement for core.js)
        |                                       |
        v                                       v
  +------------------+                  +------------------+
  | memory-mcp.js    |                  |   memory.js      |
  | (stdio MCP srv)  |                  | (wrapper API)    |
  +------------------+                  +------------------+
        \                                      /
         \                                    /
          +----------------------------------+
          |         memory-store.js          |
          |  SQLite + FTS5 engine            |
          |                                  |
          |  FTS5 MATCH (BM25 ranking)       |
          |  + kind boost (fact > lesson)    |
          |  + importance (0.0 - 1.0)        |
          |  + recency (90-day decay)        |
          |  + usage frequency               |
          +----------------------------------+
                        |
                        v
                +------------------+
                |  data/memory.db  |
                |  (SQLite, WAL)   |
                +------------------+
```

## Quick Install

```bash
# From the twin project directory:
cp /path/to/memory-module/files/*.js ./
npm install better-sqlite3 @modelcontextprotocol/sdk
```

Then add to `.mcp.json`:
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

And swap the import in your dispatch file:
```javascript
import { recallContext, remember } from "./memory.js";
```

## MCP Tools

The MCP server (`memory-mcp.js`) exposes these tools:

| Tool                  | Description                                      |
|-----------------------|--------------------------------------------------|
| `memory_recall`       | Search memory with FTS5 full-text search         |
| `memory_remember`     | Save content as event, lesson, or fact           |
| `memory_add_fact`     | Store a curated fact (higher recall priority)    |
| `memory_add_lesson`   | Store a lesson with "applies when" context       |
| `memory_stats`        | Get total/active/archived counts by kind         |
| `memory_consolidate`  | Archive stale events and unused facts            |

The MCP server reads the DB path from `MEMORY_DB_PATH` env var, defaulting to `./data/memory.db`.

## CLI Usage

```bash
node memory-cli.js recall "search query" [--limit 5] [--json]
node memory-cli.js remember "content to save" [--importance 0.8]
node memory-cli.js add-fact --title "Title" --body "Body text"
node memory-cli.js add-lesson --title "Title" --body "Body" --applies-when "Context"
node memory-cli.js consolidate
node memory-cli.js stats
```

## Memory Types

| Kind     | Default Importance | Recall Boost | Use Case                           |
|----------|-------------------|--------------|-------------------------------------|
| `event`  | 0.5               | -0.5         | Raw observations, conversation turns|
| `lesson` | 0.8               | +1.0         | Distilled learnings with context    |
| `fact`   | 0.7               | +1.5         | Curated knowledge, high-value info  |

## Scoring Formula

Each recalled memory is scored with:

```
score = bm25_relevance + kind_boost + importance + usage_bonus + recency
```

- **bm25_relevance**: FTS5 full-text search relevance (negated, higher = better)
- **kind_boost**: fact (+1.5), lesson (+1.0), event (-0.5)
- **importance**: 0.0 to 1.0 weight
- **usage_bonus**: use_count * 0.05, capped at 0.5 (10 uses)
- **recency**: linear decay from 1.0 to 0.0 over 90 days

## Consolidation

Run `consolidate()` or the `memory_consolidate` MCP tool periodically:

- **Events** older than 30 days with importance <= 0.3 and never recalled -> archived
- **Facts** older than 30 days and never recalled -> archived

Archived memories (active = 0) are excluded from recall but preserved in the database.

## Files

| File               | Purpose                                            |
|--------------------|----------------------------------------------------|
| `memory-store.js`  | Core SQLite + FTS5 engine, all CRUD operations     |
| `memory.js`        | Drop-in wrapper exporting recallContext/remember   |
| `memory-mcp.js`    | MCP stdio server exposing memory as agent tools    |
| `memory-cli.js`    | CLI for manual memory operations                   |

## Requirements

- Node.js >= 18
- ESM project (`"type": "module"` in package.json)
- `better-sqlite3` and `@modelcontextprotocol/sdk` (see `deps.txt`)
