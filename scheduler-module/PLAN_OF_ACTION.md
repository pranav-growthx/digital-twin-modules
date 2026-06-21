# Scheduler Module — Plan of Action

Ordered checklist for integrating the scheduler into your digital twin.

## Steps

- [ ] **1. Confirm Node.js project**
  Ensure the twin has a `package.json` with `"type": "module"`.

- [ ] **2. Install dependencies**
  ```bash
  cd node/
  npm install dotenv
  ```

- [ ] **3. Copy schedule.js and scheduler.js**
  Both files live in `node/`. If you're integrating into a monorepo, copy or symlink them into the twin's project root alongside `core.js`.

- [ ] **4. Auto-start the scheduler inside the twin**
  Find the twin's `main()` or startup entry point and add:
  ```javascript
  import { startScheduler } from "./scheduler.js";
  startScheduler();
  ```
  This starts the polling loop when the twin boots. The scheduler runs in the same process.

- [ ] **5. Ensure the twin's `claude -p` has Bash tool access**
  The skill file calls `node schedule.js` via Bash. Confirm the twin's Claude session allows Bash tool usage. If using a `.claude/settings.json`, ensure `Bash` is not restricted.

- [ ] **6. Install the skill**
  Copy `.claude/skills/schedule-task/SKILL.md` to the twin's `.claude/skills/schedule-task/` directory. This teaches the twin how to create scheduled jobs when users ask.

- [ ] **7. Add data/jobs.json to .gitignore**
  ```
  # Scheduler runtime data
  node/data/jobs.json
  ```

- [ ] **8. Restart twin and test**
  Restart the twin process, then test with:
  > "send me a hi message in 2 minutes"

  Verify:
  - The skill runs `node schedule.js --at ...`
  - A job appears in `data/jobs.json`
  - After 2 minutes, the scheduler fires and delivers via console + macOS notification

- [ ] **9. Report**
  Confirm the module is working. Note any Slack configuration needed for Slack delivery.
