# Memory Module — Plan of Action

Ordered checklist for the coding agent to integrate this module into a twin project.

## Prerequisites

- [ ] Confirm the twin project has a `core.js` (or equivalent) that exports `recallContext` and `remember`
- [ ] Confirm Node.js >= 18 is available
- [ ] Confirm the project uses ESM (`"type": "module"` in package.json)

## Steps

1. **Install dependencies**
   ```bash
   npm install better-sqlite3
   ```

2. **Copy module files to project root**
   ```bash
   cp node/memory-store.js ./memory-store.js
   cp node/memory.js ./memory.js
   cp node/memory-cli.js ./memory-cli.js
   ```
   Adjust the import path in `memory.js` and `memory-cli.js` if placing files in a different directory.

3. **Wire into the twin's dispatch**
   In the file that currently imports `recallContext` / `remember` from `core.js`, change:
   ```javascript
   // Before
   import { recallContext, remember } from "./core.js";

   // After
   import { recallContext, remember } from "./memory.js";
   ```
   The function signatures are identical — no other code changes needed.

4. **Migrate existing memory.json (if any)**
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

5. **Add data directory to .gitignore**
   ```
   data/*.db
   data/*.db-wal
   data/*.db-shm
   ```

6. **Verify the integration**
   ```bash
   # Store a memory
   node memory-cli.js remember "The user prefers dark mode and concise answers"

   # Recall it
   node memory-cli.js recall "user preferences"

   # Check stats
   node memory-cli.js stats
   ```
   Confirm the recall returns the stored memory.

7. **End-to-end test with the twin**
   - Send a message that triggers `remember()`
   - Send a follow-up that should trigger `recallContext()`
   - Confirm the twin's reply includes context from the stored memory

8. **Report** (3 lines)
   - Replaced flat-file memory with SQLite + FTS5 full-text search
   - Same interface (`recallContext` / `remember`), better ranking (BM25 + recency + importance + usage)
   - Three memory types: events (auto), lessons, facts — with consolidation for stale entries
