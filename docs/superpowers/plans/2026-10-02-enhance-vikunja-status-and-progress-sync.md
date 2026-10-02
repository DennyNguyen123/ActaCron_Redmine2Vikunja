# Enhance Vikunja Task Status, Progress, and Description Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Vikunja task completion, percentage progress, and status changes are accurately synced from Redmine by mapping `percent_done`, including full description diffing, and properly closing tasks in Vikunja.

**Architecture:**
1. `modules/mapper.js`: Add helper `mapPercentDone(issue)` to map Redmine `done_ratio` (0-100) or closed status to Vikunja's float `percent_done` (0.0 to 1.0).
2. `modules/sync_engine.js`:
   - Include `percent_done` in `taskPayload`. When closed/resolved, `done: true` and `percent_done: 1.0`.
   - Update change detection to check `percent_done` and `description` in addition to `title`, `done`, `priority`, and `due_date`. This ensures status transitions (e.g. New -> In Progress) and description/attachment updates trigger an update even when closed state doesn't change.
   - When updating Vikunja task, merge `taskPayload` with `existingTask` to preserve required fields and ensure Vikunja's Go backend applies status changes reliably.
3. Unit tests: Verify in `tests/test_mapper.js` and `tests/test_sync_engine.js`.

**Tech Stack:** JavaScript (Goja / ES5.1+ runtime compatible, zero external dependencies, CommonJS).

**Spec:** Redmine to Vikunja Status & Progress sync accuracy.

## Global Constraints

- Must run in Goja JS engine (ES5.1 / ES6 baseline, zero external dependencies).
- Vikunja float percent: 0.0 to 1.0 (e.g., Redmine 50% -> Vikunja 0.5, Closed/Resolved -> 1.0).

## Review Focus

1. Open issues with custom `done_ratio` (e.g. 20%) should map to `percent_done: 0.2` and `done: false`.
2. Closed/Resolved issues must always set `done: true` AND `percent_done: 1.0`.
3. Issues transitioning between open statuses (e.g. New -> In Progress) where `done` remains `false`: change in `description` must trigger `needsUpdate: true`.
4. Vikunja task update payload preserves fields and correctly syncs `percent_done`.

---

### Task 1: Add `mapPercentDone` in Mapper Module

**Files:**
- Modify: `modules/mapper.js`
- Test: `tests/test_mapper.js`

**Interfaces:**
- Consumes: `issue: object`
- Produces: `mapper.mapPercentDone(issue)` -> `number` (0.0 - 1.0)

- [ ] **Step 1: Write failing test in `tests/test_mapper.js`**

```javascript
// Test mapPercentDone
assert.strictEqual(mapper.mapPercentDone({ done_ratio: 50 }), 0.5);
assert.strictEqual(mapper.mapPercentDone({ done_ratio: 100 }), 1.0);
assert.strictEqual(mapper.mapPercentDone({ done_ratio: 0 }), 0.0);
assert.strictEqual(mapper.mapPercentDone({ status: { name: "Resolved" } }), 1.0);
assert.strictEqual(mapper.mapPercentDone({ status: { is_closed: true } }), 1.0);
assert.strictEqual(mapper.mapPercentDone(null), 0.0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_mapper.js`
Expected: FAIL (`mapper.mapPercentDone is not a function`)

- [ ] **Step 3: Implement `mapPercentDone` in `modules/mapper.js`**

```javascript
function mapPercentDone(issue) {
  if (!issue) return 0;
  if (isIssueClosed(issue)) return 1.0;
  if (issue.done_ratio !== undefined && issue.done_ratio !== null) {
    var ratio = Number(issue.done_ratio);
    if (!isNaN(ratio)) {
      return Math.max(0, Math.min(1.0, ratio / 100));
    }
  }
  return 0;
}
```
Export `mapPercentDone` in `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_mapper.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/mapper.js tests/test_mapper.js
git commit -m "feat(mapper): add mapPercentDone helper for Vikunja task progress"
```

---

### Task 2: Update Sync Engine Change Detection and Task Payload

**Files:**
- Modify: `modules/sync_engine.js`
- Test: `tests/test_sync_engine.js`

**Interfaces:**
- Consumes: `mapper.mapPercentDone`, `existingTask.percent_done`, `existingTask.description`
- Produces: Accurate updates for task completion, progress ratio, and description changes.

- [ ] **Step 1: Write failing test in `tests/test_sync_engine.js`**

Add tests for:
1. Issue status changing from "New" to "In Progress" (both are open, but description & status changed): must trigger update (`updated: 1`).
2. Issue status changing to "Resolved": must update `done: true` and `percent_done: 1.0`.
3. Issue `done_ratio` changing from 0% to 60%: must update `percent_done: 0.6`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sync_engine.js`
Expected: FAIL

- [ ] **Step 3: Implement payload & diff updates in `modules/sync_engine.js`**

1. In `taskPayload`:
```javascript
var isClosed = mapper.isIssueClosed(issue);
var percentDone = mapper.mapPercentDone(issue);

var taskPayload = {
  title: mapper.formatTitle(issue),
  description: mapper.formatDescription(issue, redmineConfig.url),
  priority: mapper.mapPriority(issue.priority),
  done: isClosed,
  percent_done: percentDone,
  due_date: issue.due_date ? issue.due_date + "T23:59:59Z" : null
};
```
2. In `needsUpdate` diff check:
Check `done`, `percent_done`, `priority`, `title`, `due_date`, and `description`.
3. In `updateTask` payload:
Send `taskPayload` with `percent_done` and update local cache fields `existingTask.done`, `existingTask.percent_done`, `existingTask.description`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_sync_engine.js`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add modules/sync_engine.js tests/test_sync_engine.js
git commit -m "feat(sync): support percent_done and description diffing for accurate task state"
```
