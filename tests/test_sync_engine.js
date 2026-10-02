const assert = require("assert");

const mockStore = {};
const mockStorage = {
  get: (k) => mockStore[k] || null,
  set: (k, v) => { mockStore[k] = v; },
  delete: (k) => { delete mockStore[k]; }
};

let tasksCreated = 0;
let tasksUpdated = 0;

let remoteVikunjaTasks = [];

global.http = {
  get: function(url, headers) {
    if (url.includes("/issues.json")) {
      return {
        status: 200,
        body: JSON.stringify({
          issues: [
            {
              id: 1,
              subject: "Task One",
              project: { id: 10, name: "Project Alpha" },
              updated_on: "2026-09-30T10:00:00Z"
            },
            {
              id: 2,
              subject: "Task Two",
              project: { id: 10, name: "Project Alpha" },
              updated_on: "2026-09-30T10:00:00Z"
            }
          ]
        })
      };
    }
    if (url.includes("/api/v1/projects/") && url.includes("/tasks")) {
      const pageMatch = url.match(/page=(\d+)/);
      const perPageMatch = url.match(/per_page=(\d+)/);
      if (pageMatch && perPageMatch) {
        const page = parseInt(pageMatch[1], 10);
        const perPage = parseInt(perPageMatch[1], 10);
        const start = (page - 1) * perPage;
        return { status: 200, body: JSON.stringify(remoteVikunjaTasks.slice(start, start + perPage)) };
      }
      // If no pagination params given by caller, Vikunja server returns page 1 only!
      return { status: 200, body: JSON.stringify(remoteVikunjaTasks.slice(0, 1)) };
    }
    if (url.includes("/api/v1/projects")) {
      const pageMatch = url.match(/page=(\d+)/);
      const perPageMatch = url.match(/per_page=(\d+)/);
      const projects = [{ id: 100, title: "Project Alpha" }];
      if (pageMatch && perPageMatch) {
        const page = parseInt(pageMatch[1], 10);
        const perPage = parseInt(perPageMatch[1], 10);
        const start = (page - 1) * perPage;
        return { status: 200, body: JSON.stringify(projects.slice(start, start + perPage)) };
      }
      return { status: 200, body: JSON.stringify(projects) };
    }
    return { status: 200, body: "{}" };
  },
  put: function(url, body, headers) {
    if (url.includes("/tasks")) {
      tasksCreated++;
      const newTask = { id: 500 + tasksCreated, title: body.title };
      remoteVikunjaTasks.push(newTask);
      return { status: 201, body: JSON.stringify(newTask) };
    }
    return { status: 201, body: JSON.stringify({ id: 100 }) };
  },
  post: function(url, body, headers) {
    tasksUpdated++;
    return { status: 200, body: JSON.stringify({ id: 501 }) };
  }
};

const syncEngine = require("../modules/sync_engine");

console.log("Testing modules/sync_engine.js...");

// Initial Sync: should create 2 tasks
const res1 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage
});

assert.strictEqual(res1.created, 2);
assert.strictEqual(res1.updated, 0);
assert.strictEqual(res1.skipped, 0);
assert.strictEqual(tasksCreated, 2);

// Second Sync with unchanged issues: should skip 2 tasks
const res2 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage
});

assert.strictEqual(res2.created, 0);
assert.strictEqual(res2.updated, 0);
assert.strictEqual(res2.skipped, 2);

// Dry Run test
const dryRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage,
  dryRun: true
});
assert.strictEqual(dryRes.dry_run, true);

// Force update test: even if timestamps match, update tasks
const forceRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage,
  force: true
});
assert.strictEqual(forceRes.updated, 2);
assert.strictEqual(forceRes.skipped, 0);

// Test Self-healing on 404: if update fails with 404, re-create task
const originalPost = global.http.post;
global.http.post = function(url, body, headers) {
  const err = new Error("HTTP 404: Task not found");
  err.status = 404;
  throw err;
};

const selfHealRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage,
  force: true
});
assert.strictEqual(selfHealRes.created, 2);
global.http.post = originalPost;

// Test Reset Cache / Cross-machine sync:
// Even when cache is cleared/reset or missing, engine discovers remote Vikunja tasks by title prefix [#id]
// and updates them rather than duplicating them!
const createdBeforeReset = tasksCreated;
const resetRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage,
  resetCache: true
});
assert.strictEqual(resetRes.created, 0); // Discovered remotely, no duplicates created!
assert.strictEqual(resetRes.updated, 2); // Updated instead
assert.strictEqual(tasksCreated, createdBeforeReset); // Zero new tasks put to Vikunja

console.log("All sync engine tests passed!");
