# Guide for Implementing the Memory Module

Paste this entire file into Claude Code to have it integrate the memory module into your twin project.

---

You are Claude Code. You are upgrading a digital twin's memory system from a flat `memory.json` file to a proper SQLite + FTS5 full-text search engine. The twin currently has a `core.js` that exports `recallContext(query)` and `remember(content)`. You will replace those with better implementations that use SQLite.

## Step 1: Install better-sqlite3

```bash
npm install better-sqlite3
```

## Step 2: Create `memory-store.js`

Create this file in the project root. This is the core engine.

```javascript
import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

export function createMemoryStore(dbPath) {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_node (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      kind         TEXT NOT NULL DEFAULT 'event'
                     CHECK (kind IN ('event', 'lesson', 'fact')),
      title        TEXT NOT NULL,
      body         TEXT NOT NULL,
      importance   REAL NOT NULL DEFAULT 0.5
                     CHECK (importance >= 0 AND importance <= 1),
      tags         TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      use_count    INTEGER NOT NULL DEFAULT 0,
      active       INTEGER NOT NULL DEFAULT 1
                     CHECK (active IN (0, 1))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      title,
      body,
      tags,
      content = 'memory_node',
      content_rowid = 'id'
    );

    CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_node BEGIN
      INSERT INTO memory_fts(rowid, title, body, tags)
        VALUES (new.id, new.title, new.body, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_node BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, title, body, tags)
        VALUES ('delete', old.id, old.title, old.body, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory_node BEGIN
      INSERT INTO memory_fts(memory_fts, rowid, title, body, tags)
        VALUES ('delete', old.id, old.title, old.body, old.tags);
      INSERT INTO memory_fts(rowid, title, body, tags)
        VALUES (new.id, new.title, new.body, new.tags);
    END;
  `);

  const insertNode = db.prepare(`
    INSERT INTO memory_node (kind, title, body, importance, tags)
    VALUES (@kind, @title, @body, @importance, @tags)
  `);

  const ftsSearch = db.prepare(`
    SELECT
      mn.id, mn.kind, mn.title, mn.body, mn.importance,
      mn.tags, mn.created_at, mn.last_used_at, mn.use_count,
      bm25(memory_fts) AS bm25_score
    FROM memory_fts
    JOIN memory_node mn ON mn.id = memory_fts.rowid
    WHERE memory_fts MATCH @query AND mn.active = 1
    ORDER BY bm25(memory_fts)
    LIMIT @searchLimit
  `);

  const touchUsage = db.prepare(`
    UPDATE memory_node
    SET use_count = use_count + 1, last_used_at = datetime('now')
    WHERE id = @id
  `);

  const archiveStale = db.prepare(`
    UPDATE memory_node SET active = 0
    WHERE kind = 'event' AND active = 1
      AND importance <= 0.3 AND use_count = 0
      AND created_at < datetime('now', '-30 days')
  `);

  const markStaleFacts = db.prepare(`
    UPDATE memory_node SET active = 0
    WHERE kind = 'fact' AND active = 1
      AND use_count = 0
      AND created_at < datetime('now', '-30 days')
  `);

  const statsQuery = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_count,
      SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END) AS archived_count,
      SUM(CASE WHEN kind = 'event' THEN 1 ELSE 0 END) AS events,
      SUM(CASE WHEN kind = 'lesson' THEN 1 ELSE 0 END) AS lessons,
      SUM(CASE WHEN kind = 'fact' THEN 1 ELSE 0 END) AS facts
    FROM memory_node
  `);

  const KIND_BOOST = { fact: 1.5, lesson: 1.0, event: -0.5 };

  function recencyScore(createdAt) {
    const ageMs = Date.now() - new Date(createdAt + "Z").getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 0) return 1.0;
    if (ageDays >= 90) return 0.0;
    return 1.0 - ageDays / 90;
  }

  function autoTitle(content) {
    const firstSentence = content.match(/^[^.!?\n]+[.!?]?/);
    if (firstSentence && firstSentence[0].length <= 80) return firstSentence[0].trim();
    return content.slice(0, 80).trim();
  }

  function sanitizeQuery(query) {
    const tokens = query.replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return null;
    if (tokens.length === 1) return `"${tokens[0]}"`;
    return tokens.map((t) => `"${t}"`).join(" OR ");
  }

  function recall(query, options = {}) {
    try {
      if (!query || typeof query !== "string") return [];
      const sanitized = sanitizeQuery(query);
      if (!sanitized) return [];
      const limit = options.limit ?? 5;
      const kinds = options.kinds ?? null;
      const minImportance = options.minImportance ?? 0;
      const searchLimit = Math.max(limit * 4, 20);
      const rows = ftsSearch.all({ query: sanitized, searchLimit });

      let scored = rows.map((row) => {
        const bm25 = -row.bm25_score;
        const boost = KIND_BOOST[row.kind] ?? 0;
        const usageScore = Math.min(row.use_count * 0.05, 0.5);
        const recency = recencyScore(row.created_at);
        const score = bm25 + boost + row.importance + usageScore + recency;
        return {
          id: row.id, kind: row.kind, title: row.title, body: row.body,
          importance: row.importance, tags: row.tags, created_at: row.created_at, score,
        };
      });

      if (kinds && kinds.length > 0) scored = scored.filter((r) => kinds.includes(r.kind));
      if (minImportance > 0) scored = scored.filter((r) => r.importance >= minImportance);
      scored.sort((a, b) => b.score - a.score);
      const results = scored.slice(0, limit);

      const updateMany = db.transaction((ids) => {
        for (const id of ids) touchUsage.run({ id });
      });
      updateMany(results.map((r) => r.id));

      return results;
    } catch (err) {
      console.error("[memory-store] recall error:", err.message);
      return [];
    }
  }

  function remember(content, options = {}) {
    try {
      if (!content || typeof content !== "string") return { id: -1 };
      const kind = options.kind ?? "event";
      const title = options.title ?? autoTitle(content);
      const importance = options.importance ?? 0.5;
      const tags = options.tags ?? "";
      const result = insertNode.run({ kind, title, body: content, importance, tags });
      return { id: Number(result.lastInsertRowid) };
    } catch (err) {
      console.error("[memory-store] remember error:", err.message);
      return { id: -1 };
    }
  }

  function addFact(title, body, options = {}) {
    try {
      const importance = options.importance ?? 0.7;
      const tags = options.tags ?? "";
      const result = insertNode.run({ kind: "fact", title, body, importance, tags });
      return { id: Number(result.lastInsertRowid) };
    } catch (err) {
      console.error("[memory-store] addFact error:", err.message);
      return { id: -1 };
    }
  }

  function addLesson(title, body, appliesWhen, options = {}) {
    try {
      const importance = options.importance ?? 0.8;
      const tags = options.tags ?? "";
      const fullBody = `${body}\n\nApplies when: ${appliesWhen}`;
      const result = insertNode.run({ kind: "lesson", title, body: fullBody, importance, tags });
      return { id: Number(result.lastInsertRowid) };
    } catch (err) {
      console.error("[memory-store] addLesson error:", err.message);
      return { id: -1 };
    }
  }

  function consolidate() {
    try {
      const evResult = archiveStale.run();
      const factResult = markStaleFacts.run();
      return { archivedEvents: evResult.changes, staleFacts: factResult.changes };
    } catch (err) {
      console.error("[memory-store] consolidate error:", err.message);
      return { archivedEvents: 0, staleFacts: 0 };
    }
  }

  function stats() {
    try {
      return statsQuery.get();
    } catch (err) {
      console.error("[memory-store] stats error:", err.message);
      return { total: 0, active_count: 0, archived_count: 0, events: 0, lessons: 0, facts: 0 };
    }
  }

  function close() {
    try { db.close(); } catch { /* ignore */ }
  }

  return { recall, remember, addFact, addLesson, consolidate, stats, close };
}
```

## Step 3: Create `memory.js`

This is the drop-in wrapper that replaces the twin's memory functions.

```javascript
import { createMemoryStore } from "./memory-store.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, "data", "memory.db");

const store = createMemoryStore(dbPath);

export function recallContext(query) {
  if (!query) return "";
  try {
    const memories = store.recall(query, { limit: 5 });
    if (!memories.length) return "";
    const lines = memories.map(
      (m, i) => `${i + 1}. ${m.title}: ${m.body.slice(0, 300)}`
    );
    return ["## Relevant memories (from past conversations)", ...lines].join("\n");
  } catch {
    return "";
  }
}

export function remember(content, importance = 0.5) {
  try {
    store.remember(content, { importance });
  } catch {
    // Best-effort: never break a reply
  }
}

export { store };
```

## Step 4: Create `memory-cli.js`

```javascript
#!/usr/bin/env node

import { createMemoryStore } from "./memory-store.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, "data", "memory.db");

const store = createMemoryStore(dbPath);

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] ?? true;
}

function hasFlag(name) {
  return args.includes(name);
}

function printUsage() {
  console.log(`Usage:
  node memory-cli.js recall "search query" [--limit 5] [--json]
  node memory-cli.js remember "content to save" [--importance 0.8]
  node memory-cli.js add-fact --title "..." --body "..."
  node memory-cli.js add-lesson --title "..." --body "..." --applies-when "..."
  node memory-cli.js consolidate
  node memory-cli.js stats`);
}

try {
  switch (command) {
    case "recall": {
      const query = args[1];
      if (!query) { console.error("Error: query is required"); printUsage(); process.exit(1); }
      const limit = parseInt(flag("--limit") || "5", 10);
      const results = store.recall(query, { limit });
      if (hasFlag("--json")) {
        console.log(JSON.stringify(results, null, 2));
      } else if (results.length === 0) {
        console.log("No memories found.");
      } else {
        for (const m of results) {
          console.log(`[${m.kind}] ${m.title}`);
          console.log(`  Score: ${m.score.toFixed(3)} | Importance: ${m.importance} | Uses: ${m.use_count ?? 0}`);
          console.log(`  ${m.body.slice(0, 200)}`);
          console.log();
        }
      }
      break;
    }
    case "remember": {
      const content = args[1];
      if (!content) { console.error("Error: content is required"); printUsage(); process.exit(1); }
      const importance = parseFloat(flag("--importance") || "0.5");
      const result = store.remember(content, { importance });
      console.log(`Remembered (id: ${result.id}, importance: ${importance})`);
      break;
    }
    case "add-fact": {
      const title = flag("--title"); const body = flag("--body");
      if (!title || !body) { console.error("Error: --title and --body are required"); printUsage(); process.exit(1); }
      const result = store.addFact(title, body);
      console.log(`Fact added (id: ${result.id})`);
      break;
    }
    case "add-lesson": {
      const title = flag("--title"); const body = flag("--body"); const appliesWhen = flag("--applies-when");
      if (!title || !body || !appliesWhen) { console.error("Error: --title, --body, and --applies-when are required"); printUsage(); process.exit(1); }
      const result = store.addLesson(title, body, appliesWhen);
      console.log(`Lesson added (id: ${result.id})`);
      break;
    }
    case "consolidate": {
      const result = store.consolidate();
      console.log(`Consolidation complete:\n  Archived events: ${result.archivedEvents}\n  Stale facts: ${result.staleFacts}`);
      break;
    }
    case "stats": {
      const s = store.stats();
      console.log(`Memory Statistics:\n  Total: ${s.total}\n  Active: ${s.active_count}\n  Archived: ${s.archived_count}\n  Events: ${s.events}\n  Lessons: ${s.lessons}\n  Facts: ${s.facts}`);
      break;
    }
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
} finally {
  store.close();
}
```

## Step 5: Wire into the twin

Find the file that imports `recallContext` and `remember` from `core.js` and change the import:

```javascript
// Replace this:
import { recallContext, remember } from "./core.js";

// With this:
import { recallContext, remember } from "./memory.js";
```

## Step 6: Migrate existing memory.json

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

## Step 7: Update .gitignore

Add these lines:

```
data/*.db
data/*.db-wal
data/*.db-shm
```

## Step 8: Verify

```bash
node memory-cli.js remember "The user prefers dark mode and concise answers"
node memory-cli.js recall "user preferences"
node memory-cli.js stats
```

Confirm the recall returns the stored memory.

## Step 9: Report

When done, report:
1. Replaced flat-file memory with SQLite + FTS5 full-text search
2. Same interface (recallContext/remember), better ranking (BM25 + recency + importance + usage)
3. Three memory types: events (auto), lessons, facts -- with consolidation for stale entries
