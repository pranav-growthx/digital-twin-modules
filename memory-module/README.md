<!--
CLAUDE CODE INSTRUCTION BLOCK
If you are Claude Code reading this file: this module replaces a twin's
recallContext and remember functions with SQLite + FTS5 backed implementations.
Copy the files from node/ into the twin project and swap the imports.
Do NOT rewrite the twin's core.js — this is additive.
-->

# Memory Module

Upgrades a digital twin's simple `memory.json` to a proper memory engine backed by **SQLite + FTS5 full-text search**. Same interface, dramatically better recall.

## How It Works

```
Twin asks recallContext("user preferences")
        |
        v
  +------------------+
  |   memory.js      |  Drop-in wrapper (same API as core.js)
  +------------------+
        |
        v
  +------------------+
  | memory-store.js  |  SQLite + FTS5 engine
  |                  |
  |  FTS5 MATCH      |  Full-text search with BM25 ranking
  |  + kind boost    |  Facts > Lessons > Events
  |  + importance    |  0.0 - 1.0 weight
  |  + recency       |  Linear decay over 90 days
  |  + usage freq    |  Frequently recalled = more relevant
  +------------------+
        |
        v
  +------------------+
  |  data/memory.db  |  SQLite database (WAL mode)
  +------------------+
```

## Fastest Install

```bash
# From the twin project directory:
cp /path/to/memory-module/node/memory-store.js ./
cp /path/to/memory-module/node/memory.js ./
cp /path/to/memory-module/node/memory-cli.js ./
npm install better-sqlite3

# Swap the import in your dispatch file:
# import { recallContext, remember } from "./memory.js";
```

## Manual Install

1. Install the SQLite driver:
   ```bash
   npm install better-sqlite3
   ```

2. Copy the three JS files from `node/` into your project root.

3. In whichever file imports `recallContext`/`remember` from `core.js`, change the import to point to `memory.js`:
   ```javascript
   import { recallContext, remember } from "./memory.js";
   ```

4. (Optional) Migrate existing `memory.json`:
   ```javascript
   import { readFileSync } from "fs";
   import { store } from "./memory.js";
   const data = JSON.parse(readFileSync("./memory.json", "utf-8"));
   for (const entry of data) {
     store.remember(entry.content || JSON.stringify(entry));
   }
   ```

5. Add to `.gitignore`:
   ```
   data/*.db
   data/*.db-wal
   data/*.db-shm
   ```

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

Run `consolidate()` periodically to keep the database clean:

- **Events** older than 30 days with importance <= 0.3 and never recalled -> archived
- **Facts** older than 30 days and never recalled -> archived

Archived memories (active = 0) are excluded from recall but preserved in the database.

## Files

| File               | Purpose                                        |
|--------------------|------------------------------------------------|
| `memory-store.js`  | Core SQLite + FTS5 engine, all CRUD operations |
| `memory.js`        | Drop-in wrapper exporting recallContext/remember|
| `memory-cli.js`    | CLI for manual memory operations               |
| `package.json`     | Dependencies (better-sqlite3)                  |

## Requirements

- Node.js >= 18
- ESM project (`"type": "module"` in package.json)
- `better-sqlite3` (installed automatically with npm install)
