# ActaCron Template Synchronization Design Spec

**Date:** 2026-09-30  
**Target:** ActaCron-Template (d:\Personal_Sources\ActaCron-Template)  
**Reference Source:** ActaCron Core (d:\Personal_Sources\ActaCron @ commit 1126b51)

---

## 1. Overview & Objective

ActaCron Core recently implemented major enhancements in commit `1126b51` (`feat: add workspace scoped env, dynamic timeout, shared library and tree ui`) and earlier parser/runtime improvements. `ActaCron-Template` is the foundational starter repository cloned or used by developers and AI agents to create new script packages.

This specification defines the exact updates required across configuration, documentation, AI skills, validation scripts, and demo routines in `ActaCron-Template` to fully support and showcase the new capabilities.

---

## 2. Architectural Updates & Requirements

### 2.1 Workspace Configuration (`workspace.json`)
Each package in `packages/<workspace_name>/` can contain a `workspace.json` file configuring package-level metadata and defaults.
- **File:** `workspace.json`
- **Schema:**
  ```json
  {
    "timeout_seconds": 60,
    "description": "ActaCron automation scripts and dynamic MCP tools"
  }
  ```
- **Requirements:**
  - `timeout_seconds`: Positive integer defining fallback execution timeout in seconds.
  - `description`: Optional human-readable workspace description displayed in ActaCron tree UI and modal.

### 2.2 Workspace Scoped Environment (`.env` and `.env.example`)
- **3-Tier Hierarchy:**
  1. `packages/<workspace>/.env` (Workspace-scoped override)
  2. Global `.env` in ActaCron root (`settingsSvc.GetEnv()`)
  3. System OS environment (`os.Getenv`)
- **Runtime Access:**
  - `env(key)` and `env.get(key)`: Query merged environment map.
  - `env.all()`: Returns key-value object of all available environment variables for this workspace.
- **Template Requirement:**
  - Update `.env.example` with instructions explaining workspace placement and sample variables for standard notification channels (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`).

### 2.3 Dynamic Timeout & JSDoc Directives
- **Directives:**
  - `@timeout <seconds>`: Custom per-function timeout in seconds (Priority 1: `@timeout` > Priority 2: `workspace.json.timeout_seconds` > Priority 3: AppSettings 30s).
  - `@allowExec true|false`: Explicitly declare functions requiring host system CLI execution.
  - `@name <identifier>`, `@description <text>`, `@cron <expr>`, `@mcp true|false`, `@param {type} <name> - <desc>`.
- **Requirements:**
  - Update `ACTACRON_SPEC.md` and `.agents/skills/actacron-task/SKILL.md`.

### 2.4 Built-in Runtime APIs & Shared Library
- **Injected Host Globals:**
  - `http.get(url, headers)` & `fetch(url, headers)`
  - `http.post(url, body, headers)`
  - `env(key)`, `env.get(key)`, `env.all()`
  - `call(target, params)` (cross-package orchestration)
  - `exec(command, args)` -> returns `{ stdout: string, stderr: string, exitCode: number }`
  - `storage.get(key)`, `storage.set(key, val)`, `storage.delete(key)` (SQLite persistent key-value store scoped per package)
  - `crypto.md5(str)`, `crypto.sha256(str)`, `crypto.uuid()`
  - `base64.encode(str)`, `base64.decode(str)`
  - `sleep(ms)`: Synchronous pause
  - `console.log(...)`, `console.warn(...)`, `console.error(...)`
  - `shared.*`: Global shared library (`shared.datetime`, `shared.notify`, `shared.utils`, `shared.constants`)
  - `require('_shared/...')` or `require('./local_module')`: CommonJS module loading with path traversal protection.

### 2.5 Validator Script (`scripts/validate.js`)
- Must validate `workspace.json` if present (valid JSON, `timeout_seconds` positive integer).
- Must check `@timeout` tag format if present.
- Must continue to validate all `.js` scripts in the workspace root for AST validity, entry point `function main(params)`, and premature comment termination trap `*/`.

### 2.6 Demo Scripts & Documentation
- Fix `system_backup.js`:
  - Add `@allowExec true` and `@timeout 60`.
  - Fix `pingOutput.length` bug to `pingOutput.stdout.length` / `pingOutput.exitCode`.
- Add `shared_library_demo.js`:
  - Showcase `shared.datetime.nowISO()`, `shared.datetime.formatDate()`, `shared.utils.uuid()`, `storage.set/get`, and `@timeout 45`.
- Fix mojibake in `README.md` (clean UTF-8 emoji and tree formatting) and document new features.
- Update AI Skill templates in `.agents/skills/actacron-task/templates/`.
