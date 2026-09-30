# ActaCron Technical Specification & Scripting Guide

This specification defines the runtime environment, JSDoc annotations, workspace configurations, and execution rules for JavaScript automation scripts running on the **ActaCron Engine**.

---

## 1. Runtime Sandbox Architecture
- **Engine:** Goja (Full ECMAScript 5.1(+) with selected ES6 features).
- **Execution Lifecycle:**
  1. On package load, ActaCron parses script headers via Abstract Syntax Tree (AST).
  2. Cron schedules are registered into the unified cron scheduler.
  3. Functions marked with `@mcp true` are registered into the dual MCP Hub (StdIO & SSE).
  4. Each execution receives an isolated runtime context with dynamic timeout safeguards:
     - **Priority 1:** JSDoc annotation `@timeout <seconds>`.
     - **Priority 2:** Workspace configuration `workspace.json` -> `timeout_seconds`.
     - **Priority 3:** Global App Settings `TimeoutSeconds` (default: 30s).
  5. Outputs and console streams are captured in SQLite unified execution logs.

---

## 2. JSDoc Directives Reference

Every script must begin with a JSDoc comment defining its metadata:

| Directive | Format | Required | Description |
| :--- | :--- | :--- | :--- |
| `@name` | `@name <identifier>` | Yes | Unique function name identifier |
| `@description` | `@description <text>` | Yes | Human and AI-readable description |
| `@cron` | `@cron <minute> <hour> <dom> <month> <dow>` | No | 5-part cron schedule. (Never use `*/`, use `0/` or commas instead) |
| `@mcp` | `@mcp true\|false` | No | Exports function as an AI Agent MCP tool |
| `@timeout` | `@timeout <seconds>` | No | Custom execution timeout in seconds (positive integer) |
| `@allowExec` | `@allowExec true\|false` | No | Explicitly enables system CLI execution for this function |
| `@param` | `@param {type} <name> - <desc>` | No | Supported types: `string`, `number`, `boolean`, `object` |

> [!WARNING]
> **Comment Termination Trap:** NEVER use `*/` inside comment blocks (e.g., do NOT write `*/10 * * * *` because `*/` immediately terminates the JSDoc comment and breaks JS syntax). Instead, write `0/10 * * * *` or `0,10,20 * * * *`.

---

## 3. Global Injected Host APIs

Scripts execute with zero external npm dependencies and have access to the following built-in host functions and modules:

### 3.1 Networking & HTTP
- `http.get(url, headers)`: Send synchronous HTTP GET request. Returns `{ status: number, body: string }`.
- `http.post(url, body, headers)`: Send synchronous HTTP POST request. `body` can be an object (auto-serialized to JSON) or string. Returns `{ status: number, body: string }`.
- `fetch(url, headers)`: Convenient alias to `http.get`.

### 3.2 Environment & Configuration
- `env(key)` or `env.get(key)`: Retrieve environment variable value with 3-tier resolution.
- `env.all()`: Retrieve a key-value object containing all resolved environment variables for the workspace.

### 3.3 Storage & Persistence (SQLite KV)
Scoped per package to prevent cross-workspace contamination:
- `storage.get(key)`: Retrieve persistent value (auto-deserializes JSON if applicable, or returns string / `null`).
- `storage.set(key, value)`: Persist value (strings or JSON-serializable objects).
- `storage.delete(key)`: Remove a key from persistent storage.

### 3.4 Cryptography & Encodings
- `crypto.md5(str)`: Compute MD5 hash hex string.
- `crypto.sha256(str)`: Compute SHA-256 hash hex string.
- `crypto.uuid()`: Generate a random UUID v4 string.
- `base64.encode(str)`: Base64 encode string.
- `base64.decode(str)`: Base64 decode string.

### 3.5 Process & Orchestration
- `call(target, params)`: Call another script across packages synchronously with cycle-detection (up to depth 10). `target` can be `package/function` or `function`.
- `exec(command, args)`: Run host CLI command (requires Allow Shell enabled in ActaCron settings and `@allowExec true`). Returns `{ stdout: string, stderr: string, exitCode: number }`.
- `sleep(ms)`: Pause script execution synchronously for `ms` milliseconds.
- `console.log(...)`, `console.warn(...)`, `console.error(...)`: Output to ActaCron execution logs and Web UI console.

### 3.6 Module Loading
- `require(modulePath)`: CommonJS module loader supporting local files within the package (e.g. `require('./helpers')`) and shared libraries (e.g. `require('_shared/utils')`). Protected against directory traversal outside `packages/`.

---

## 4. Workspace Configuration & Scoped Environment

Each repository or directory in `packages/<workspace_name>/` represents a workspace and can configure its own defaults:

### 4.1 `workspace.json`
```json
{
  "timeout_seconds": 60,
  "description": "Custom workspace for data pipelines and MCP tools"
}
```
- `timeout_seconds`: Fallback timeout when `@timeout` is not specified on an individual script.
- `description`: Displayed in the ActaCron package explorer tree and Workspace Config modal.

### 4.2 Workspace Scoped `.env`
Environment variables resolve through a **3-tier hierarchy**:
1. **Tier 1:** `packages/<workspace>/.env` (Highest priority, workspace-specific secrets).
2. **Tier 2:** ActaCron Root `.env` (Global fallback).
3. **Tier 3:** Host Operating System Environment (`os.Getenv`).

---

## 5. Shared Library System (`packages/_shared/`)

ActaCron automatically scaffolds and provides a shared library under `packages/_shared/`. Modules in this folder are available to all scripts via the global `shared` namespace or via `require('_shared/<module>')`:

- **`shared.datetime`**:
  - `nowISO()`: Current timestamp in ISO format.
  - `formatDate(date, pattern)`: Format date (supports `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`).
  - `timeAgo(date)`: Humanized relative time string (e.g. `5m ago`, `2d ago`).
  - `addDays(date, n)`: Add or subtract days.
  - `startOfDay(date)`: Reset time to midnight.
- **`shared.notify`**:
  - `telegram({ botToken, chatId, message, parseMode })`
  - `discord({ webhookUrl, content, embeds })`
  - `slack({ webhookUrl, text })`
  - `webhook(url, payload, headers)`
- **`shared.utils`**:
  - `uuid()`: UUID v4 generator.
  - `retry(fn, { retries, delayMs, backoff })`: Retry wrapper with exponential backoff.
  - `chunk(arr, size)`: Split array into smaller batches.
  - `safeJson(str, defaultVal)`: Safe JSON parse without throwing errors.
  - `formatBytes(bytes)`: Format file sizes (`KB`, `MB`, `GB`).
  - `formatCurrency(amount, currency)`: Currency formatter.
- **`shared.constants`**:
  - `HTTP_STATUS` (`OK: 200`, `BAD_REQUEST: 400`, `NOT_FOUND: 404`, `SERVER_ERROR: 500`, etc.)
  - `REGEX` (`EMAIL`, `URL`, `PHONE_VN`)
  - `TIME` (`SECOND_MS`, `MINUTE_MS`, `HOUR_MS`, `DAY_MS`)
