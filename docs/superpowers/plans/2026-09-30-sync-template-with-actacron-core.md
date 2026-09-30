# Sync Template with ActaCron Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `ActaCron-Template` to fully support and showcase ActaCron's newest core features: workspace configuration (`workspace.json`), workspace-scoped environment (`.env`), dynamic timeout (`@timeout`), shared library integration (`shared.*` and `require('_shared/...')`), and complete runtime API specifications.

**Architecture:** Add standard `workspace.json` workspace config, update `.env.example`, enhance `scripts/validate.js` to validate workspace configuration and `@timeout` tags, update `ACTACRON_SPEC.md` and AI skill `.agents/skills/actacron-task/`, fix demo script bugs in `system_backup.js`, add a new `shared_library_demo.js`, clean up UTF-8 mojibake in `README.md`, and verify everything via `npm test`.

**Tech Stack:** JavaScript (ES6 / Goja runtime), Node.js (for local AST validation), Markdown, JSON.

**Spec:** [docs/superpowers/specs/2026-09-30-sync-template-with-actacron-core-design.md](file:///d:/Personal_Sources/ActaCron-Template/docs/superpowers/specs/2026-09-30-sync-template-with-actacron-core-design.md)

## Global Constraints
- Target repository: `d:/Personal_Sources/ActaCron-Template`.
- JavaScript scripts must be compatible with Goja runtime (ES5.1 / ES6 baseline, zero npm dependencies at runtime).
- Never use premature comment termination `*/` inside JSDoc comments; use `0/` or comma notation for cron schedules.
- Validator script `scripts/validate.js` must remain zero-dependency (relying only on standard Node.js `fs`, `path`, and `vm`).
- All Markdown documentation must be clean UTF-8 without mojibake (e.g. no `ðŸš€` or `â”œâ”€â”€`).

## Review Focus
1. **Invalid JSON or negative timeout in `workspace.json`:** Validator must reject non-positive integer values for `timeout_seconds`.
2. **Comment termination trap `*/` in JSDoc:** Must continue to be flagged as failure before JS execution.
3. **Invalid `@timeout` directive:** If `@timeout` is present in JSDoc, it must be a positive integer > 0.
4. **`exec()` return contract:** `exec()` returns `{ stdout: string, stderr: string, exitCode: number }`, not raw string. Scripts accessing `.length` directly on the result must be fixed.
5. **AST Syntax Validity:** All `.js` scripts must parse successfully with `new vm.Script(...)`.

---

### Task 1: Workspace Configuration & Environment Template

**Files:**
- Create: `workspace.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: ActaCron Core `WorkspaceConfig` schema (`timeout_seconds`, `description`).
- Produces: `workspace.json` and updated `.env.example` in repo root.

- [ ] **Step 1: Write the failing test / verification script**

Run a one-liner to verify `workspace.json` does not yet exist:
```bash
node -e "if (require('fs').existsSync('workspace.json')) process.exit(1); else process.exit(0);"
```

- [ ] **Step 2: Run verification to confirm file is missing**

Run: `node -e "if (require('fs').existsSync('workspace.json')) process.exit(1); else process.exit(0);"`  
Expected: Exit code 0 (file does not exist).

- [ ] **Step 3: Create `workspace.json`**

Create `workspace.json`:
```json
{
  "timeout_seconds": 60,
  "description": "ActaCron automation scripts and dynamic MCP tools workspace"
}
```

- [ ] **Step 4: Update `.env.example`**

Update `.env.example` to detail the 3-tier hierarchy and add shared notification variables:
```bash
# ActaCron Workspace Environment Variables
# Copy this file to .env in this workspace folder, or configure via:
# ActaCron Web Dashboard -> Packages -> [⚙️ Workspace Config]
#
# 3-Tier Hierarchy:
# 1. packages/<workspace>/.env (Highest priority - workspace scoped)
# 2. ActaCron root .env (Global fallback)
# 3. Host System OS Environment Variables

# General API Configuration
API_KEY=your_api_key_here
WEBHOOK_URL=https://discord.com/api/webhooks/...
LOG_LEVEL=info

# Notification Helpers (Used by shared.notify)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
DISCORD_WEBHOOK_URL=
SLACK_WEBHOOK_URL=

# System & Backup Paths
BACKUP_PATH=C:/Backups
NOTIFY_EMAIL=admin@example.com
```

- [ ] **Step 5: Verify `workspace.json` parses as valid JSON**

Run:
```bash
node -e "const c = JSON.parse(require('fs').readFileSync('workspace.json', 'utf-8')); if (typeof c.timeout_seconds !== 'number' || c.timeout_seconds <= 0) process.exit(1); console.log('workspace.json valid:', c);"
```
Expected: Output showing valid configuration object.

- [ ] **Step 6: Commit**

```bash
git add workspace.json .env.example
git commit -m "feat(config): add workspace.json and update .env.example with 3-tier env notes"
```

---

### Task 2: Validator Enhancement (`scripts/validate.js`)

**Files:**
- Modify: `scripts/validate.js`

**Interfaces:**
- Consumes: Root directory files, `workspace.json`, `.js` files.
- Produces: CLI exit code 0 on valid scripts/config, exit code 1 on errors.

- [ ] **Step 1: Write test case verifying validator behavior**

Create a temporary check to test invalid timeout detection in `scripts/validate.js`.

- [ ] **Step 2: Update `scripts/validate.js` implementation**

Update `scripts/validate.js` to:
1. Validate `workspace.json` if present:
   - Must be valid JSON.
   - If `timeout_seconds` is present, must be a number > 0.
2. Validate `@timeout` tag in `.js` files:
   - If `@timeout` is present, verify value is a valid positive integer.
3. Validate `@allowExec` tag in `.js` files:
   - If `@allowExec` is present, verify value is `true` or `false`.
4. Retain all existing checks (`*/` trap, `@name`, `function main`, AST syntax).

```javascript
#!/usr/bin/env node
/**
 * Zero-dependency ActaCron Script & JSDoc Validator.
 * Run via `node scripts/validate.js` or `npm test`.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
let hasErrors = false;

console.log("Scanning directory for ActaCron scripts & configs:", rootDir);

// Check 0: Validate workspace.json if present
const wsJsonPath = path.join(rootDir, "workspace.json");
if (fs.existsSync(wsJsonPath)) {
  console.log("\nValidating [workspace.json]...");
  try {
    const wsContent = fs.readFileSync(wsJsonPath, "utf-8");
    const wsConfig = JSON.parse(wsContent);
    if (wsConfig.timeout_seconds !== undefined) {
      if (typeof wsConfig.timeout_seconds !== "number" || wsConfig.timeout_seconds <= 0 || !Number.isInteger(wsConfig.timeout_seconds)) {
        console.error("  [FAIL] 'timeout_seconds' in workspace.json must be a positive integer!");
        hasErrors = true;
      } else {
        console.log(`  [PASS] workspace timeout: ${wsConfig.timeout_seconds}s`);
      }
    }
    console.log("  [PASS] workspace.json syntax is valid.");
  } catch (err) {
    console.error(`  [FAIL] workspace.json is invalid JSON: ${err.message}`);
    hasErrors = true;
  }
}

const files = fs.readdirSync(rootDir).filter(f => f.endsWith(".js"));

if (files.length === 0) {
  console.log("No .js scripts found in root directory.");
  process.exit(hasErrors ? 1 : 0);
}

files.forEach(file => {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, "utf-8");
  console.log(`\nValidating [${file}]...`);

  // Check 1: Comment termination trap: '*/' inside JSDoc comments
  const jsdocMatches = content.match(/\/\*\*[\s\S]*?\*\//g);
  if (jsdocMatches) {
    jsdocMatches.forEach(doc => {
      const inner = doc.slice(3, -2);
      if (inner.includes("*/")) {
        console.error(`  [FAIL] Detected premature '*/' inside JSDoc comment! Replace '*/' with '0/' or comma-separated values.`);
        hasErrors = true;
      }
    });
  }

  // Check 2: JSDoc annotations
  if (!/@name\s+[\w-]+/.test(content)) {
    console.warn(`  [WARN] Missing @name directive in JSDoc header.`);
  }

  // Check 2b: Validate @timeout directive if present
  const timeoutMatch = content.match(/@timeout\s+([^\r\n]+)/);
  if (timeoutMatch) {
    const timeoutVal = parseInt(timeoutMatch[1].trim(), 10);
    if (isNaN(timeoutVal) || timeoutVal <= 0) {
      console.error(`  [FAIL] Invalid @timeout value '${timeoutMatch[1]}'. Must be a positive integer.`);
      hasErrors = true;
    } else {
      console.log(`  [INFO] Custom timeout specified: ${timeoutVal}s`);
    }
  }

  // Check 2c: Validate @allowExec directive if present
  const allowExecMatch = content.match(/@allowExec\s+([^\r\n]+)/);
  if (allowExecMatch) {
    const val = allowExecMatch[1].trim();
    if (val !== "true" && val !== "false") {
      console.error(`  [FAIL] Invalid @allowExec value '${val}'. Must be true or false.`);
      hasErrors = true;
    }
  }

  // Check 3: Entry point main function
  if (!/function\s+main\s*\(/.test(content)) {
    console.error(`  [FAIL] Missing 'function main(params)' entry point!`);
    hasErrors = true;
  }

  // Check 4: JavaScript AST syntax validity
  try {
    new vm.Script(content, { filename: file });
    console.log(`  [PASS] JavaScript syntax is valid.`);
  } catch (err) {
    console.error(`  [FAIL] Syntax Error in ${file}: ${err.message}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error("\nValidation failed with errors!");
  process.exit(1);
} else {
  console.log("\nAll ActaCron scripts validated successfully!");
  process.exit(0);
}
```

- [ ] **Step 3: Run validator against current repository**

Run: `node scripts/validate.js`  
Expected: Exit code 0, all files pass including `workspace.json`.

- [ ] **Step 4: Commit**

```bash
git add scripts/validate.js
git commit -m "feat(validator): add workspace.json, @timeout, and @allowExec validation checks"
```

---

### Task 3: Technical Specification Documentation (`ACTACRON_SPEC.md`)

**Files:**
- Modify: `ACTACRON_SPEC.md`

**Interfaces:**
- Consumes: ActaCron Core Architecture & Goja Sandbox APIs.
- Produces: Updated comprehensive specification document.

- [ ] **Step 1: Update `ACTACRON_SPEC.md`**

Expand `ACTACRON_SPEC.md` with:
- Updated Section 1 (Runtime Sandbox Architecture): Explain dynamic timeout hierarchy (`@timeout` > `workspace.json` > global 30s).
- Updated Section 2 (JSDoc Directives Reference): Add `@timeout` and `@allowExec`.
- Updated Section 3 (Global Injected APIs): Full catalog including `storage.*`, `crypto.*`, `base64.*`, `sleep()`, `fetch()`, `env.get()`, `env.all()`, `shared.*`, `require()`, and exact `exec()` return signature.
- Add Section 4 (Workspace Configuration & Scoped Environment): `workspace.json` format and 3-tier env resolution.
- Add Section 5 (Shared Library System): Modules in `packages/_shared/` (`datetime`, `notify`, `utils`, `constants`).

- [ ] **Step 2: Verify Markdown formatting and links**

Review the rendered content for accuracy and formatting consistency.

- [ ] **Step 3: Commit**

```bash
git add ACTACRON_SPEC.md
git commit -m "docs: update ACTACRON_SPEC.md with timeout hierarchy, shared library, and sandbox APIs"
```

---

### Task 4: AI Agent Skill & Script Templates (`.agents/skills/actacron-task/`)

**Files:**
- Modify: `.agents/skills/actacron-task/SKILL.md`
- Modify: `.agents/skills/actacron-task/templates/cron_job.js`
- Modify: `.agents/skills/actacron-task/templates/mcp_tool.js`
- Create: `.agents/skills/actacron-task/templates/shared_job.js`

**Interfaces:**
- Consumes: Antigravity/Cursor agent skill schema.
- Produces: Up-to-date AI skill instructions and templates.

- [ ] **Step 1: Update `.agents/skills/actacron-task/SKILL.md`**

Update the skill instructions to:
- Include `@timeout <seconds>` and `@allowExec true|false` in mandatory JSDoc header annotations.
- Include `storage`, `crypto`, `base64`, `sleep`, `env.get()`, `env.all()`, `shared.*`, and `require('_shared/...')` in Injected Sandbox APIs.
- Update the code blueprint to demonstrate `@timeout` and `shared.datetime.nowISO()`.

- [ ] **Step 2: Update `templates/cron_job.js` and `templates/mcp_tool.js`**

Add `@timeout 30` to both templates.

- [ ] **Step 3: Create `templates/shared_job.js`**

Create a template demonstrating usage of `shared.datetime`, `shared.utils`, `shared.notify`, and `storage`:
```javascript
/**
 * @name sample_shared_job
 * @cron 0 8 * * *
 * @timeout 45
 * @mcp false
 * @description Demonstrates utilizing ActaCron shared utilities and persistent storage.
 */
function main(params) {
  // Use shared datetime helper
  const now = (typeof shared !== "undefined" && shared.datetime)
    ? shared.datetime.nowISO()
    : new Date().toISOString();

  // Use persistent key-value storage
  const lastRun = (typeof storage !== "undefined") ? storage.get("last_run") : null;
  if (typeof storage !== "undefined") {
    storage.set("last_run", now);
  }

  console.log("sample_shared_job running. Previous run was:", lastRun);

  return {
    status: "success",
    current_run: now,
    previous_run: lastRun
  };
}
```

- [ ] **Step 4: Validate template syntax**

Run: `node -e "new (require('vm').Script)(require('fs').readFileSync('.agents/skills/actacron-task/templates/shared_job.js', 'utf-8')); console.log('Template valid');"`  
Expected: "Template valid"

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/actacron-task/
git commit -m "feat(skills): update actacron-task skill and templates with timeout, shared library, and storage"
```

---

### Task 5: Script Fixes and New Shared Library Demo

**Files:**
- Modify: `system_backup.js`
- Create: `shared_library_demo.js`

**Interfaces:**
- Consumes: ActaCron sandbox APIs (`exec`, `shared.*`, `storage.*`, `env.all`).
- Produces: Bug-free and fully featured sample scripts in workspace root.

- [ ] **Step 1: Fix `system_backup.js`**

Add `@allowExec true`, `@timeout 60`, and fix `pingOutput.length` to `pingOutput.stdout.length`:
```javascript
/**
 * @name system_backup
 * @cron 0 2 * * *
 * @timeout 60
 * @allowExec true
 * @mcp false
 * @description Executes shell/system utilities via exec() to create scheduled backups or health diagnostics.
 * @param {string} targetDir - Custom destination folder path (optional)
 */
function main(params) {
  // Read configured environment variable or fallback to parameter / default
  const backupRoot = (params && params.targetDir) || env("BACKUP_PATH") || "C:/Backups";
  console.log("Starting backup task with target root:", backupRoot);

  // Note: exec() requires "Allow Shell Commands" enabled in ActaCron Settings
  const pingResult = exec("ping", ["-n", "1", "127.0.0.1"]);
  const stdoutLen = (pingResult && pingResult.stdout) ? pingResult.stdout.length : 0;
  console.log("Loopback ping executed. Exit code:", pingResult ? pingResult.exitCode : -1, "Output length:", stdoutLen);

  return {
    status: "completed",
    destination: backupRoot,
    exit_code: pingResult ? pingResult.exitCode : -1,
    executed_at: new Date().toISOString()
  };
}
```

- [ ] **Step 2: Create `shared_library_demo.js`**

Create `shared_library_demo.js`:
```javascript
/**
 * @name shared_library_demo
 * @cron 0 9 * * 1-5
 * @timeout 45
 * @mcp true
 * @description Demonstrates ActaCron shared library (shared.*), safe require('_shared/...'), and persistent storage.
 * @param {string} taskName - Name of the demo task to record (optional)
 */
function main(params) {
  const task = (params && params.taskName) || "Daily Routine";

  // 1. Shared Datetime Helpers
  const timestamp = (typeof shared !== "undefined" && shared.datetime)
    ? shared.datetime.nowISO()
    : new Date().toISOString();

  // 2. Shared Utilities (UUID, Safe JSON)
  const executionId = (typeof shared !== "undefined" && shared.utils)
    ? shared.utils.uuid()
    : (typeof crypto !== "undefined" ? crypto.uuid() : "manual-" + Date.now());

  // 3. Persistent Package Storage
  let runCount = 0;
  if (typeof storage !== "undefined") {
    const prev = storage.get("run_count");
    runCount = (typeof prev === "number" ? prev : 0) + 1;
    storage.set("run_count", runCount);
    storage.set("last_execution_id", executionId);
  }

  // 4. Scoped Environment Variables
  const allEnvKeys = (typeof env !== "undefined" && typeof env.all === "function")
    ? Object.keys(env.all())
    : [];

  console.log("Executing", task, "| Run count:", runCount, "| ID:", executionId);

  return {
    status: "success",
    task: task,
    run_count: runCount,
    execution_id: executionId,
    timestamp: timestamp,
    available_env_count: allEnvKeys.length
  };
}
```

- [ ] **Step 3: Run `node scripts/validate.js`**

Run: `node scripts/validate.js`  
Expected: Exit code 0, all scripts including `system_backup.js` and `shared_library_demo.js` pass with PASS messages.

- [ ] **Step 4: Commit**

```bash
git add system_backup.js shared_library_demo.js
git commit -m "feat(scripts): fix exec pingOutput handling in system_backup.js and add shared_library_demo.js"
```

---

### Task 6: Readme & UTF-8 Encoding Overhaul

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Clean UTF-8 formatting, new repo tree layout.
- Produces: Pristine `README.md` without mojibake.

- [ ] **Step 1: Update `README.md`**

Replace all mojibake with clean UTF-8 emojis (`🚀`, `🤖`, `📁`, `├──`, `└──`, `🧪`, `⚙️`).  
Document:
- Workspace Configuration (`workspace.json`).
- Workspace-scoped Environment (`.env`).
- Dynamic Timeouts (`@timeout`).
- Shared Library integration (`shared.*` and `require('_shared/...')`).
- Updated file tree layout including `workspace.json` and `shared_library_demo.js`.

- [ ] **Step 2: Verify `README.md` in UTF-8**

Run:
```bash
node -e "const content = require('fs').readFileSync('README.md', 'utf-8'); if (content.includes('ðŸ') || content.includes('â”')) { console.error('Mojibake detected!'); process.exit(1); } else console.log('README clean UTF-8!');"
```
Expected: "README clean UTF-8!"

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: fix UTF-8 mojibake in README and document workspace configuration and shared library"
```

---

### Task 7: End-to-End Validation & Final Check

**Files:**
- All repository files

**Interfaces:**
- Consumes: npm test runner (`node scripts/validate.js`).
- Produces: Clean git status and 100% passing checks.

- [ ] **Step 1: Run npm test**

Run: `npm test`  
Expected: Exit code 0, all scripts and configs pass.

- [ ] **Step 2: Inspect git status**

Run: `git status`  
Expected: Working tree clean, all commits cleanly recorded on master branch.

---
