---
name: actacron-task
description: Specialized skill for AI coding assistants to design, create, and validate JavaScript automation scripts and dynamic MCP tools for ActaCron.
---

# ActaCron Script Creator Skill

Use this skill whenever the user asks to create, modify, or debug scripts for **ActaCron**.

## Core Responsibilities

1. **JSDoc Header Annotations (Mandatory):**
   Every script must begin with a well-formed JSDoc comment containing:
   - `@name <function_name>`: Unique identifier for the function.
   - `@description <summary>`: Clear explanation of what the script does.
   - `@cron <cron_expr>`: 5-part cron schedule (`minute hour dom month dow`).
     - **CRITICAL RULE:** NEVER use `*/` inside comment blocks (e.g. do NOT write `*/10 * * * *` because `*/` immediately terminates the JSDoc comment and breaks JS syntax). Instead, write `0/10 * * * *` or `0,10,20 * * * *`.
   - `@mcp true|false`: Set to `true` if this function should be exported as an AI Agent MCP Tool.
   - `@timeout <seconds>`: Custom per-function timeout in seconds (e.g. `@timeout 60`).
   - `@allowExec true|false`: Set to `true` if this function requires system CLI execution via `exec()`.
   - `@param {type} <name> - <description>`: Input parameters schema for manual test or AI tool calling.

2. **Entry Point Requirement:**
   - Every script must define an entry function: `function main(params) { ... }`.
   - `params` contains JSON input (or an empty object `{}` if triggered by cron).
   - Must return a JSON-serializable value (object, array, primitive).

3. **Injected Sandbox APIs (Only use these built-ins):**
   - **`http.get(url, headers)` / `fetch(url, headers)`**: Returns `{ status: number, body: string }`.
   - **`http.post(url, body, headers)`**: `body` can be an object or string. Returns `{ status: number, body: string }`.
   - **`env(key)` / `env.get(key)`**: Retrieves environment variables with 3-tier hierarchy (workspace `.env` > root `.env` > OS env).
   - **`env.all()`**: Returns all available workspace environment variables as a key-value object.
   - **`storage.get(key)` / `storage.set(key, val)` / `storage.delete(key)`**: Package-scoped persistent SQLite KV store.
   - **`crypto.md5(str)` / `crypto.sha256(str)` / `crypto.uuid()`**: Built-in cryptographic hashing and UUID v4 generation.
   - **`base64.encode(str)` / `base64.decode(str)`**: Base64 encoding/decoding.
   - **`sleep(ms)`**: Synchronous execution pause.
   - **`console.log(...)` / `console.warn(...)` / `console.error(...)`**: Unified logging to ActaCron DB and Web UI console.
   - **`call(target, params)`**: Synchronously invokes another function across packages. `target` is `package_name/function_name` or `function_name`.
   - **`exec(command, argsArray)`**: Executes system CLI binary (requires Allow Shell enabled in ActaCron and `@allowExec true`). Returns `{ stdout: string, stderr: string, exitCode: number }`.
   - **`shared.*`**: Reusable shared library routines (`shared.datetime`, `shared.notify`, `shared.utils`, `shared.constants`).
   - **`require('_shared/<module>')` / `require('./local_module')`**: CommonJS module import with path traversal protection.

4. **Zero External Runtime Dependencies:**
   - Scripts run inside the Goja JavaScript engine (ES5.1 / ES6 baseline). Do NOT require npm packages at runtime. Use standard JSON, Math, and the injected host APIs.

## Standard Code Blueprint

```javascript
/**
 * @name my_scheduled_task
 * @cron 0 9 * * 1-5
 * @timeout 60
 * @mcp true
 * @description Sends notification summary every weekday at 9 AM
 * @param {string} channel - Target notification channel
 */
function main(params) {
  const channel = (params && params.channel) || "general";
  const webhookUrl = env("WEBHOOK_URL");

  // Use shared datetime helper
  const now = (typeof shared !== "undefined" && shared.datetime)
    ? shared.datetime.nowISO()
    : new Date().toISOString();

  console.log("Executing my_scheduled_task at:", now, "for channel:", channel);

  if (!webhookUrl) {
    throw new Error("Missing WEBHOOK_URL environment variable");
  }

  const res = http.post(webhookUrl, {
    content: "Daily update for #" + channel + " at " + now
  }, { "Content-Type": "application/json" });

  return {
    status: res.status === 200 ? "ok" : "failed",
    http_code: res.status,
    executed_at: now
  };
}
```
