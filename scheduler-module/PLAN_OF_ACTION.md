# Scheduler Module -- Plan of Action

Ordered checklist for integrating the scheduler into your digital twin.

## Steps

- [ ] **1. Confirm Node.js project**
  Ensure the twin has a `package.json` with `"type": "module"` and a `core.js` entry point.

- [ ] **2. Copy files from `files/` to project root**
  Copy `scheduler.js`, `schedule.js`, `scheduler-mcp.js`, and the `workflows/` directory to the twin's project root.

- [ ] **3. Install dependencies**
  ```bash
  npm install dotenv @modelcontextprotocol/sdk zod
  ```

- [ ] **4. Add MCP server to `.mcp.json`**
  ```json
  {
    "mcpServers": {
      "scheduler": {
        "command": "node",
        "args": ["scheduler-mcp.js"]
      }
    }
  }
  ```

- [ ] **5. Wire `startScheduler()` into twin startup**
  In the twin's main entry point (e.g. `core.js` or `main.js`):
  ```javascript
  import { startScheduler } from "./scheduler.js";
  startScheduler();
  ```

- [ ] **6. (Optional) Copy the skill**
  Copy `skills/schedule-task/SKILL.md` to `.claude/skills/schedule-task/SKILL.md` as a fallback. The MCP tools replace most of what the skill did.

- [ ] **7. Add `data/jobs.json` to .gitignore**
  ```
  # Scheduler runtime data
  data/jobs.json
  ```

- [ ] **8. Test**
  Ask the twin: "remind me to check email in 2 minutes"

  Verify:
  - The agent calls the `schedule_task` MCP tool
  - A job appears in `data/jobs.json`
  - After 2 minutes, the scheduler fires and delivers via console + macOS notification

- [ ] **9. Report**
  Confirm the module is working. Note any platform-specific configuration needed (e.g. Slack delivery callback).
