# Vikunja Deduplication by Title Prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate Vikunja task creation across multiple machines or fresh environments by discovering existing Redmine issues from Vikunja task title prefixes (`[#<issueId>]`).

**Architecture:** 
1. `modules/mapper.js` adds a helper to extract the Redmine issue ID from a task title using regex `/^\[#(\d+)\]/`.
2. `modules/vikunja.js` exposes `getProjectTasks` to query tasks belonging to a Vikunja project via `GET /api/v1/projects/:projectId/tasks`.
3. `modules/sync_engine.js` implements a remote discovery check: when an issue is not in the local SQLite cache, it lazily fetches remote tasks for the target Vikunja project, parses their title prefixes, and populates the cache map to update/skip rather than duplicate.

**Tech Stack:** JavaScript (Goja / ES5.1+ runtime compatible, zero external dependencies, CommonJS).

**Spec:** In-chat bounded design agreed with user: Option A (Deduplication via Title Prefix `[#<id>]` with self-healing remote discovery).

## Global Constraints

- Must run in Goja JS engine (ES5.1 / ES6 baseline, use `var`, no unsupported syntax).
- Zero external runtime npm dependencies.
- Maintain existing `storage` SQLite caching for performance, using remote query as self-healing fallback when cache is missing.

## Review Focus

1. Tasks on Vikunja with titles that don't match `[#<id>]` pattern (e.g., manually created tasks) must be ignored and not crash.
2. Vikunja API returning pagination or empty list: handles non-array / empty array safely.
3. Multiple sync passes within the same execution: caches fetched remote tasks per project to avoid redundant `GET /tasks` HTTP calls.
4. Issue ID matching must handle string vs number conversions reliably.
5. Dry-run mode must accurately report `"would_update"` when matched remotely instead of `"would_create"`.

---

### Task 1: Add Title Prefix Parser in Mapper Module

**Files:**
- Modify: `modules/mapper.js`
- Test: `tests/test_mapper.js`

**Interfaces:**
- Consumes: task title string
- Produces: `mapper.extractIssueId(title)` -> `number | null`

- [ ] **Step 1: Write the failing test in `tests/test_mapper.js`**

Add tests to `tests/test_mapper.js`:
```javascript
// Test extractIssueId
assert.strictEqual(mapper.extractIssueId("[#123] Fix login bug"), 123);
assert.strictEqual(mapper.extractIssueId("[#99999] [Backend] DB migration"), 99999);
assert.strictEqual(mapper.extractIssueId("No issue tag in title"), null);
assert.strictEqual(mapper.extractIssueId(""), null);
assert.strictEqual(mapper.extractIssueId(null), null);
assert.strictEqual(mapper.extractIssueId("[#abc] Invalid tag"), null);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_mapper.js`
Expected: FAIL (`mapper.extractIssueId is not a function`)

- [ ] **Step 3: Implement minimal code in `modules/mapper.js`**

```javascript
function extractIssueId(title) {
  if (!title || typeof title !== "string") {
    return null;
  }
  var match = title.match(/^\[#(\d+)\]/);
  return match ? Number(match[1]) : null;
}
```
Export `extractIssueId` in `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_mapper.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/mapper.js tests/test_mapper.js
git commit -m "feat(mapper): add extractIssueId helper for Vikunja title deduplication"
```

---

### Task 2: Add `getProjectTasks` in Vikunja Client

**Files:**
- Modify: `modules/vikunja.js`
- Test: `tests/test_vikunja.js`

**Interfaces:**
- Consumes: `config: { url, token }`, `projectId: number|string`, `options?: { page, per_page, s }`
- Produces: `vikunja.getProjectTasks(config, projectId, options)` -> `Array<object>`

- [ ] **Step 1: Write the failing test in `tests/test_vikunja.js`**

Add tests to `tests/test_vikunja.js` verifying:
```javascript
// Test getProjectTasks
const tasks = vikunja.getProjectTasks(config, 10);
assert.strictEqual(Array.isArray(tasks), true);
assert.strictEqual(tasks.length, 1);
assert.strictEqual(tasks[0].id, 88);
assert.strictEqual(tasks[0].title, "[#105] Fix login button");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_vikunja.js`
Expected: FAIL (`vikunja.getProjectTasks is not a function`)

- [ ] **Step 3: Implement `getProjectTasks` in `modules/vikunja.js`**

```javascript
function getProjectTasks(config, projectId, options) {
  options = options || {};
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/projects/" + encodeURIComponent(projectId) + "/tasks";
  var queryParts = [];
  if (options.page) queryParts.push("page=" + encodeURIComponent(options.page));
  if (options.per_page) queryParts.push("per_page=" + encodeURIComponent(options.per_page));
  if (options.s) queryParts.push("s=" + encodeURIComponent(options.s));
  if (queryParts.length > 0) {
    endpoint += "?" + queryParts.join("&");
  }
  var res = httpClient.get(endpoint, getHeaders(config.token));
  return Array.isArray(res.data) ? res.data : [];
}
```
Export `getProjectTasks` in `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_vikunja.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/vikunja.js tests/test_vikunja.js
git commit -m "feat(vikunja): add getProjectTasks API client method"
```

---

### Task 3: Integrate Remote Discovery in Sync Engine & Prevent Duplicate Creation

**Files:**
- Modify: `modules/sync_engine.js`
- Test: `tests/test_sync_engine.js`

**Interfaces:**
- Consumes: `vikunjaClient.getProjectTasks`, `mapper.extractIssueId`
- Produces: Updated `runSync` that automatically maps existing remote Vikunja tasks when SQLite cache is empty.

- [ ] **Step 1: Write the failing test in `tests/test_sync_engine.js`**

Add test scenario:
When SQLite cache is reset / cleared, but Vikunja project already contains tasks with `[#1]` and `[#2]`:
`runSync` must NOT create duplicate tasks; it should detect the existing tasks on Vikunja, update or skip them, and report `created: 0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sync_engine.js`
Expected: FAIL (currently creates 2 tasks because local cache is empty).

- [ ] **Step 3: Implement remote discovery in `modules/sync_engine.js`**

1. Maintain an in-memory dictionary `projectRemoteTaskCache = {}` during the sync run to avoid redundant HTTP requests for the same project.
2. In the loop, when `!existingRecord`:
   - Ensure the Vikunja project ID is resolved.
   - If `projectRemoteTaskCache[vikunjaProjectId]` hasn't been fetched yet, call `vikunjaClient.getProjectTasks(vikunjaConfig, vikunjaProjectId)`.
   - Iterate through remote tasks, parse `mapper.extractIssueId(t.title)`.
   - For every remote task with a valid issue ID:
     ```javascript
     if (!issueMap[remoteIssueId]) {
       issueMap[remoteIssueId] = {
         vikunja_task_id: t.id,
         last_updated_on: null,
         synced_at: new Date().toISOString()
       };
     }
     ```
   - Re-evaluate `existingRecord = issueMap[issueId]`.
3. If `existingRecord` is now populated, proceed to update (or skip), preventing duplicates!

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_sync_engine.js`
Expected: PASS

- [ ] **Step 5: Run all test suites across the project**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add modules/sync_engine.js tests/test_sync_engine.js
git commit -m "feat(sync_engine): deduplicate tasks using remote Vikunja task titles"
```
