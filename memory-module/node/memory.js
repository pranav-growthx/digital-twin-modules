import { createMemoryStore } from "./memory-store.js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, "data", "memory.db");

const store = createMemoryStore(dbPath);

/**
 * Recall relevant memories for prompt injection.
 * Drop-in replacement for the twin's recallContext.
 *
 * @param {string} query - The search query
 * @returns {string} Formatted memory context, or "" if nothing found
 */
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

/**
 * Remember content as a memory event.
 * Drop-in replacement for the twin's remember.
 *
 * @param {string} content - Content to store
 * @param {number} [importance=0.5] - Importance score 0-1
 */
export function remember(content, importance = 0.5) {
  try {
    store.remember(content, { importance });
  } catch {
    // Best-effort: never break a reply
  }
}

// Re-export the full store for advanced usage
export { store };
