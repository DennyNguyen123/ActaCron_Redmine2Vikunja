# Stateless Vikunja-Driven Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove local SQLite storage dependency entirely and make synchronization 100% stateless by querying Vikunja API directly as the single source of truth for projects and tasks.

**Architecture:**
1. `modules/vikunja.js`: Modify `ensureProject` to match directly against `getAllProjects(config)` (case-insensitive title match), removing SQLite `storage` parameter and persistent project cache.
2. `modules/sync_engine.js`: Remove SQLite `storage` lookup and writes. When syncing, engine fetches current remote tasks per project directly via `vikunjaClient.getAllProjectTasks`, maps them by `[#<id>]`, and compares fields (`done`, `priority`, `title`, `due_date`) against Redmine to decide whether to update or skip. If not found on Vikunja, it creates the task.
3. `redmine_to_vikunja_sync.js`: Clean up JSDoc and invocation params to reflect stateless architecture.
4. Unit & integration test suites: Update to test stateless sync across repeated runs, field changes, and remote deletions without SQLite mocks.

**Tech Stack:** JavaScript (Goja / ES5.1+ runtime compatible, zero external dependencies, CommonJS).

**Spec:** Stateless sync architecture: Vikunja API as the single source of truth; zero SQLite DB caching.

## Global Constraints

- Must run in Goja JS engine (ES5.1 / ES6 baseline, ES5 syntax, no unsupported ES6+ APIs).
- Zero external runtime npm dependencies.
- No local file/database storage requirements.

## Review Focus

1. Redmine issues belonging to multiple distinct projects in the same sync run: ensure project-level task maps are isolated by `vikunjaProjectId`.
2. Change detection: verify that `done`, `priority`, `title`, and `due_date` changes trigger `updateTask`, while identical tasks correctly trigger `skipped` without issuing unnecessary HTTP POST calls.
3. Self-healing on 404: if an update request receives 404 (e.g. task deleted mid-run), it gracefully falls back to `createTask`.
4. Backward compatibility for `options.storage`: if `storage` is passed in options, ignore it gracefully without crashing.

---

### Task 1: Make `vikunja.ensureProject` Stateless

**Files:**
- Modify: `modules/vikunja.js`
- Test: `tests/test_vikunja.js`

**Interfaces:**
- Consumes: `config: { url, token }`, `options: { redmineProjectId, projectName, description }`
- Produces: `vikunja.ensureProject(config, options)` -> `number` (project ID)

- [ ] **Step 1: Write failing test in `tests/test_vikunja.js`**

Update `tests/test_vikunja.js` to call `vikunja.ensureProject(config, { redmineProjectId, projectName })` without passing `mockStorage`, asserting it discovers existing projects via `getAllProjects` and creates missing ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_vikunja.js`
Expected: FAIL or mismatch with old `(config, storage, options)` signature.

- [ ] **Step 3: Implement stateless `ensureProject` in `modules/vikunja.js`**

Support both `ensureProject(config, options)` and legacy `ensureProject(config, storage, options)` (if 2nd arg is storage, shift options to 3rd arg):
```javascript
function ensureProject(config, options, maybeOptions) {
  // Support both (config, options) and legacy (config, storage, options)
  if (maybeOptions && typeof maybeOptions === "object") {
    options = maybeOptions;
  }
  options = options || {};
  var redmineProjectId = options.redmineProjectId;
  var projectName = options.projectName || ("Redmine Project #" + redmineProjectId);

  var projects = getAllProjects(config);
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].title && projects[i].title.toLowerCase() === projectName.toLowerCase()) {
      return projects[i].id;
    }
  }

  var newProj = createProject(config, {
    title: projectName,
    description: options.description || ("Synchronized from Redmine Project #" + redmineProjectId)
  });
  return newProj.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_vikunja.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/vikunja.js tests/test_vikunja.js
git commit -m "refactor(vikunja): make ensureProject stateless and direct-query"
```

---

### Task 2: Refactor `sync_engine.js` to 100% Stateless Sync

**Files:**
- Modify: `modules/sync_engine.js`
- Test: `tests/test_sync_engine.js`

**Interfaces:**
- Consumes: `options: { redmine, vikunja, limit, dryRun, force }`
- Produces: `result: { status, total, created, updated, skipped, dry_run, synced_issues }`

- [ ] **Step 1: Write failing test in `tests/test_sync_engine.js`**

Add tests in `tests/test_sync_engine.js`:
1. First sync with empty Vikunja: creates 2 tasks.
2. Second sync immediately after with no changes on Redmine: skips 2 tasks without SQLite storage!
3. Third sync with 1 issue status changed (closed): updates 1 task, skips 1 task.
4. Fourth sync with Vikunja remote tasks deleted: automatically recreates the 2 tasks (self-healing without needing `resetCache`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sync_engine.js`
Expected: FAIL

- [ ] **Step 3: Implement stateless `runSync` in `modules/sync_engine.js`**

1. Remove SQLite `storage.get/set/delete` logic.
2. Maintain in-memory `projectTasksMap[vikunjaProjectId]` per sync run:
   - Call `vikunjaClient.getAllProjectTasks(vikunjaConfig, vikunjaProjectId)`.
   - Index tasks by `mapper.extractIssueId(t.title)`.
3. For each issue:
   - Check if task exists in `projectTasksMap[vikunjaProjectId][issue.id]`.
   - If not found: call `createTask`, increment `created`.
   - If found: compare `done`, `priority`, `title`, and `due_date`:
     - If matches and not `force`: increment `skipped`.
     - If differs or `force`: call `updateTask`, increment `updated`.
     - If `updateTask` throws 404: call `createTask` (self-healing), increment `created`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_sync_engine.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add modules/sync_engine.js tests/test_sync_engine.js
git commit -m "feat(sync_engine): migrate to 100% stateless Vikunja-driven sync"
```

---

### Task 3: Update `redmine_to_vikunja_sync.js` Entry Script

**Files:**
- Modify: `redmine_to_vikunja_sync.js`
- Test: `node scripts/validate.js`

**Interfaces:**
- Entry point `main(params)` calling `syncEngine.runSync` without SQLite storage dependency.

- [ ] **Step 1: Update `redmine_to_vikunja_sync.js`**

Remove `var storageClient = ...` and references to `resetCache` / SQLite storage. Keep `force` parameter for manual forced sync.

- [ ] **Step 2: Run validator & test suite**

Run: `npm test`
Expected: All tests pass, ActaCron JSDoc validation passes.

- [ ] **Step 3: Commit**

```bash
git add redmine_to_vikunja_sync.js
git commit -m "chore(sync): remove storage dependency from entry script"
```
