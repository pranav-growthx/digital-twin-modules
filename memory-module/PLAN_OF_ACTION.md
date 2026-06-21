# Memory Module — Plan of Action

Ordered checklist for the coding agent to integrate this module into a twin project.

## Prerequisites

- [ ] Confirm the twin project is a Node.js project with a `core.js` (or equivalent) that exports `recallContext` and `remember`
- [ ] Confirm Node.js >= 18 is available
- [ ] Confirm the project uses ESM (`"type": "module"` in package.json)

## Steps

1. **Copy module files to project root**
   ```bash
   cp files/memory-store.js ./memory-store.js
   cp files/memory.js ./memory.js
   cp files/memory-cli.js ./memory-cli.js
   cp files/memory-mcp.js ./memory-mcp.js
   ```

2. **Install dependencies**
   ```bash
   npm install better-sqlite3 @modelcontextprotocol/sdk
   ```

3. **Add MCP server to `.mcp.json`**
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

4. **Wire memory.js into dispatch**
   In the file that currently imports `recallContext` / `remember` from `core.js`, change:
   ```javascript
   // Before
   import { recallContext, remember } from "./core.js";

   // After
   import { recallContext, remember } from "./memory.js";
   ```
   The function signatures are identical — no other code changes needed.

5. **Migrate existing memory.json (if any)**
   If the twin has a `memory.json` with existing data:
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

6. **Add data directory to .gitignore**
   ```
   data/*.db
   data/*.db-wal
   data/*.db-shm
   ```

7. **Verify the integration**
   ```bash
   # Store a memory
   node memory-cli.js remember "The user prefers dark mode and concise answers"

   # Recall it
   node memory-cli.js recall "user preferences"

   # Check stats
   node memory-cli.js stats
   ```
   Confirm the recall returns the stored memory.

8. **Report** (3 lines)
   - Replaced flat-file memory with SQLite + FTS5 full-text search
   - MCP server added for direct agent tool access (memory_recall, memory_remember, memory_add_fact, memory_add_lesson, memory_stats, memory_consolidate)
   - Same wrapper interface (recallContext/remember) for core dispatch, plus MCP tools for richer agent interactions
