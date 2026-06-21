import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

/**
 * Creates/opens a SQLite memory store at the given path.
 *
 * Tables:
 *   memory_node — id, kind, title, body, importance, tags, created_at,
 *                 last_used_at, use_count, active
 *   memory_fts  — FTS5 virtual table over memory_node (title, body, tags)
 *
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {{ recall, remember, addFact, addLesson, consolidate, close }}
 */
export function createMemoryStore(dbPath) {
  // Auto-create parent directory
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // WAL mode + relaxed sync for performance
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

  // ── Schema ───────────────────────────────────────────────────────────
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

    -- Keep FTS index in sync via triggers
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

  // ── Prepared statements ──────────────────────────────────────────────
  const insertNode = db.prepare(`
    INSERT INTO memory_node (kind, title, body, importance, tags)
    VALUES (@kind, @title, @body, @importance, @tags)
  `);

  const ftsSearch = db.prepare(`
    SELECT
      mn.id,
      mn.kind,
      mn.title,
      mn.body,
      mn.importance,
      mn.tags,
      mn.created_at,
      mn.last_used_at,
      mn.use_count,
      bm25(memory_fts) AS bm25_score
    FROM memory_fts
    JOIN memory_node mn ON mn.id = memory_fts.rowid
    WHERE memory_fts MATCH @query
      AND mn.active = 1
    ORDER BY bm25(memory_fts)
    LIMIT @searchLimit
  `);

  const touchUsage = db.prepare(`
    UPDATE memory_node
    SET use_count    = use_count + 1,
        last_used_at = datetime('now')
    WHERE id = @id
  `);

  const archiveStale = db.prepare(`
    UPDATE memory_node
    SET active = 0
    WHERE kind = 'event'
      AND active = 1
      AND importance <= 0.3
      AND use_count = 0
      AND created_at < datetime('now', '-30 days')
  `);

  const markStaleFacts = db.prepare(`
    UPDATE memory_node
    SET active = 0
    WHERE kind = 'fact'
      AND active = 1
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

  // ── Kind boosts ──────────────────────────────────────────────────────
  const KIND_BOOST = {
    fact: 1.5,
    lesson: 1.0,
    event: -0.5,
  };

  // ── Helpers ──────────────────────────────────────────────────────────

  /**
   * Compute a recency score: linear decay from 1.0 to 0.0 over 90 days.
   */
  function recencyScore(createdAt) {
    const ageMs = Date.now() - new Date(createdAt + "Z").getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 0) return 1.0;
    if (ageDays >= 90) return 0.0;
    return 1.0 - ageDays / 90;
  }

  /**
   * Extract a title from content: first sentence or first 80 chars.
   */
  function autoTitle(content) {
    const firstSentence = content.match(/^[^.!?\n]+[.!?]?/);
    if (firstSentence && firstSentence[0].length <= 80) {
      return firstSentence[0].trim();
    }
    return content.slice(0, 80).trim();
  }

  /**
   * Sanitize a query for FTS5 — remove characters that break MATCH syntax.
   * Wraps each token in double-quotes and joins with OR so partial matches
   * are returned (ranked by BM25 — more tokens matched = higher score).
   */
  function sanitizeQuery(query) {
    const tokens = query
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return null;
    if (tokens.length === 1) return `"${tokens[0]}"`;
    return tokens.map((t) => `"${t}"`).join(" OR ");
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Search memory using FTS5 full-text search with multi-signal scoring.
   *
   * @param {string} query - Search query
   * @param {{ limit?: number, kinds?: string[], minImportance?: number }} [options]
   * @returns {Array<{ id, kind, title, body, importance, tags, created_at, score }>}
   */
  function recall(query, options = {}) {
    try {
      if (!query || typeof query !== "string") return [];

      const sanitized = sanitizeQuery(query);
      if (!sanitized) return [];

      const limit = options.limit ?? 5;
      const kinds = options.kinds ?? null;
      const minImportance = options.minImportance ?? 0;

      // Fetch a wider set, then re-rank and filter in JS
      const searchLimit = Math.max(limit * 4, 20);
      const rows = ftsSearch.all({ query: sanitized, searchLimit });

      let scored = rows.map((row) => {
        // bm25() returns negative values (lower = better match), negate for scoring
        const bm25 = -row.bm25_score;
        const boost = KIND_BOOST[row.kind] ?? 0;
        const usageScore = Math.min(row.use_count * 0.05, 0.5); // capped at 10 uses
        const recency = recencyScore(row.created_at);

        const score = bm25 + boost + row.importance + usageScore + recency;

        return {
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          importance: row.importance,
          tags: row.tags,
          created_at: row.created_at,
          score,
        };
      });

      // Filter by kind if specified
      if (kinds && kinds.length > 0) {
        scored = scored.filter((r) => kinds.includes(r.kind));
      }

      // Filter by minimum importance
      if (minImportance > 0) {
        scored = scored.filter((r) => r.importance >= minImportance);
      }

      // Sort by composite score descending
      scored.sort((a, b) => b.score - a.score);

      // Take top-k
      const results = scored.slice(0, limit);

      // Update usage stats for returned results
      const updateMany = db.transaction((ids) => {
        for (const id of ids) {
          touchUsage.run({ id });
        }
      });
      updateMany(results.map((r) => r.id));

      return results;
    } catch (err) {
      // Best-effort: never break a reply
      console.error("[memory-store] recall error:", err.message);
      return [];
    }
  }

  /**
   * Store a memory event.
   *
   * @param {string} content - The content to remember
   * @param {{ importance?: number, kind?: string, title?: string, tags?: string }} [options]
   * @returns {{ id: number }}
   */
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

  /**
   * Add a fact (higher recall priority than events).
   *
   * @param {string} title
   * @param {string} body
   * @param {{ importance?: number, tags?: string }} [options]
   * @returns {{ id: number }}
   */
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

  /**
   * Add a lesson with an "applies when" context.
   *
   * @param {string} title
   * @param {string} body
   * @param {string} appliesWhen - When this lesson is relevant
   * @param {{ importance?: number, tags?: string }} [options]
   * @returns {{ id: number }}
   */
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

  /**
   * Consolidate memory: archive stale events and unused facts.
   *
   * @returns {{ archivedEvents: number, staleFacts: number }}
   */
  function consolidate() {
    try {
      const evResult = archiveStale.run();
      const factResult = markStaleFacts.run();
      return {
        archivedEvents: evResult.changes,
        staleFacts: factResult.changes,
      };
    } catch (err) {
      console.error("[memory-store] consolidate error:", err.message);
      return { archivedEvents: 0, staleFacts: 0 };
    }
  }

  /**
   * Get memory statistics.
   *
   * @returns {{ total, active_count, archived_count, events, lessons, facts }}
   */
  function stats() {
    try {
      return statsQuery.get();
    } catch (err) {
      console.error("[memory-store] stats error:", err.message);
      return { total: 0, active_count: 0, archived_count: 0, events: 0, lessons: 0, facts: 0 };
    }
  }

  /**
   * Close the database connection.
   */
  function close() {
    try {
      db.close();
    } catch {
      // ignore
    }
  }

  return { recall, remember, addFact, addLesson, consolidate, stats, close };
}
