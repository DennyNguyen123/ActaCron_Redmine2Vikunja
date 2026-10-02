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

let currentRedmineIssues = [
  {
    id: 1,
    subject: "Task One",
    project: { id: 10, name: "Project Alpha" },
    status: { id: 1, name: "Open", is_closed: false },
    priority: { id: 2, name: "Normal" },
    updated_on: "2026-09-30T10:00:00Z"
  },
  {
    id: 2,
    subject: "Task Two",
    project: { id: 10, name: "Project Alpha" },
    status: { id: 1, name: "Open", is_closed: false },
    priority: { id: 2, name: "Normal" },
    updated_on: "2026-09-30T10:00:00Z"
  }
];

global.http = {
  get: function(url, headers) {
    if (url.includes("/issues.json")) {
      return {
        status: 200,
        body: JSON.stringify({ issues: currentRedmineIssues })
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
      const newTask = {
        id: 500 + tasksCreated,
        title: body.title,
        description: body.description,
        done: body.done || false,
        priority: body.priority || 2
      };
      remoteVikunjaTasks.push(newTask);
      return { status: 201, body: JSON.stringify(newTask) };
    }
    return { status: 201, body: JSON.stringify({ id: 100 }) };
  },
  post: function(url, body, headers) {
    tasksUpdated++;
    const taskIdMatch = url.match(/\/api\/v1\/tasks\/(\d+)/);
    if (taskIdMatch) {
      const tId = parseInt(taskIdMatch[1], 10);
      for (let i = 0; i < remoteVikunjaTasks.length; i++) {
        if (remoteVikunjaTasks[i].id === tId) {
          Object.assign(remoteVikunjaTasks[i], body);
          break;
        }
      }
    }
    return { status: 200, body: JSON.stringify({ id: 501 }) };
  }
};

const syncEngine = require("../modules/sync_engine");

console.log("Testing modules/sync_engine.js (Stateless)...");

// 1. Initial Sync without storage: should create 2 tasks on empty Vikunja
const res1 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" }
});
assert.strictEqual(res1.created, 2);
assert.strictEqual(res1.updated, 0);
assert.strictEqual(res1.skipped, 0);
assert.strictEqual(tasksCreated, 2);

// 2. Second Sync with unchanged issues & no storage: should skip 2 tasks
const res2 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" }
});
assert.strictEqual(res2.created, 0);
assert.strictEqual(res2.updated, 0);
assert.strictEqual(res2.skipped, 2);

// 3. Issue #1 updated on Redmine (closed & priority high & added due_date): should update #1 and skip #2
currentRedmineIssues[0].status = { id: 5, name: "Closed", is_closed: true };
currentRedmineIssues[0].priority = { id: 3, name: "High" };
currentRedmineIssues[0].due_date = "2026-10-15";
const res3 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" }
});
assert.strictEqual(res3.created, 0);
assert.strictEqual(res3.updated, 1);
assert.strictEqual(res3.skipped, 1);

// 3b. Issue #1 due_date removed on Redmine: should detect change and update #1
delete currentRedmineIssues[0].due_date;
const res3b = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" }
});
assert.strictEqual(res3b.created, 0);
assert.strictEqual(res3b.updated, 1);
assert.strictEqual(res3b.skipped, 1);

// 4. Vikunja tasks wiped out remotely: next sync should automatically recreate both tasks (Self-Healing)
remoteVikunjaTasks = [];
const tasksBeforeRecreate = tasksCreated;
const res4 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" }
});
assert.strictEqual(res4.created, 2);
assert.strictEqual(res4.updated, 0);
assert.strictEqual(res4.skipped, 0);
assert.strictEqual(tasksCreated, tasksBeforeRecreate + 2);

// 5. Force update test
const forceRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  force: true
});
assert.strictEqual(forceRes.updated, 2);
assert.strictEqual(forceRes.skipped, 0);

// 6. Dry Run test
const dryRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  dryRun: true
});
assert.strictEqual(dryRes.dry_run, true);
assert.strictEqual(dryRes.updated, 2);
assert.strictEqual(dryRes.created, 0);

// 7. Self-healing on 404
const originalPost = global.http.post;
global.http.post = function(url, body, headers) {
  const err = new Error("HTTP 404: Task not found");
  err.status = 404;
  throw err;
};
const selfHealRes = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  force: true
});
assert.strictEqual(selfHealRes.created, 2);
global.http.post = originalPost;

console.log("All stateless sync engine tests passed!");
