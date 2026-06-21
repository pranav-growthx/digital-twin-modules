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
      if (!query) {
        console.error("Error: query is required");
        printUsage();
        process.exit(1);
      }
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
      if (!content) {
        console.error("Error: content is required");
        printUsage();
        process.exit(1);
      }
      const importance = parseFloat(flag("--importance") || "0.5");
      const result = store.remember(content, { importance });
      console.log(`Remembered (id: ${result.id}, importance: ${importance})`);
      break;
    }

    case "add-fact": {
      const title = flag("--title");
      const body = flag("--body");
      if (!title || !body) {
        console.error("Error: --title and --body are required");
        printUsage();
        process.exit(1);
      }
      const result = store.addFact(title, body);
      console.log(`Fact added (id: ${result.id})`);
      break;
    }

    case "add-lesson": {
      const title = flag("--title");
      const body = flag("--body");
      const appliesWhen = flag("--applies-when");
      if (!title || !body || !appliesWhen) {
        console.error("Error: --title, --body, and --applies-when are required");
        printUsage();
        process.exit(1);
      }
      const result = store.addLesson(title, body, appliesWhen);
      console.log(`Lesson added (id: ${result.id})`);
      break;
    }

    case "consolidate": {
      const result = store.consolidate();
      console.log(`Consolidation complete:`);
      console.log(`  Archived events: ${result.archivedEvents}`);
      console.log(`  Stale facts:     ${result.staleFacts}`);
      break;
    }

    case "stats": {
      const s = store.stats();
      console.log(`Memory Statistics:`);
      console.log(`  Total nodes:  ${s.total}`);
      console.log(`  Active:       ${s.active_count}`);
      console.log(`  Archived:     ${s.archived_count}`);
      console.log(`  Events:       ${s.events}`);
      console.log(`  Lessons:      ${s.lessons}`);
      console.log(`  Facts:        ${s.facts}`);
      break;
    }

    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
} finally {
  store.close();
}
