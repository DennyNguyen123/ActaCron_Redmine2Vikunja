const assert = require("assert");

const mockStore = {};
const mockStorage = {
  get: (k) => mockStore[k] || null,
  set: (k, v) => { mockStore[k] = v; },
  delete: (k) => { delete mockStore[k]; }
};

let tasksCreated = 0;
let tasksUpdated = 0;

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
    if (url.includes("/api/v1/projects")) {
      return { status: 200, body: JSON.stringify([{ id: 100, title: "Project Alpha" }]) };
    }
    return { status: 200, body: "{}" };
  },
  put: function(url, body, headers) {
    if (url.includes("/tasks")) {
      tasksCreated++;
      return { status: 201, body: JSON.stringify({ id: 500 + tasksCreated, title: body.title }) };
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

console.log("All sync engine tests passed!");
