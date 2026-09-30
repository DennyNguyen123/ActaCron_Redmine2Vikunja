const assert = require("assert");

console.log("Testing modules/vikunja.js...");

// In-memory mock storage
const mockStore = {};
const mockStorage = {
  get: function(k) {
    return mockStore[k] || null;
  },
  set: function(k, v) {
    mockStore[k] = v;
  },
  delete: function(k) {
    delete mockStore[k];
  }
};

// Backup any existing global.http
const originalHttp = global.http;

let createdProjects = [];
let createdTasks = [];
let httpCallHistory = [];

global.http = {
  get: function(url, headers) {
    httpCallHistory.push({ method: "GET", url: url, headers: headers });
    assert.strictEqual(headers["Authorization"], "Bearer test_token");
    if (url.includes("/api/v1/projects")) {
      return { status: 200, body: JSON.stringify(createdProjects) };
    }
    return { status: 404, body: "{}" };
  },
  post: function(url, body, headers) {
    httpCallHistory.push({ method: "POST", url: url, body: body, headers: headers });
    assert.strictEqual(headers["Authorization"], "Bearer test_token");
    if (url.includes("/api/v1/tasks/")) {
      return {
        status: 200,
        body: JSON.stringify({ id: 88, title: body.title || "Task", done: body.done || false })
      };
    }
    return { status: 200, body: "{}" };
  },
  put: function(url, body, headers) {
    httpCallHistory.push({ method: "PUT", url: url, body: body, headers: headers });
    assert.strictEqual(headers["Authorization"], "Bearer test_token");
    if (url.includes("/api/v1/projects/") && url.includes("/tasks")) {
      const task = {
        id: 88,
        title: body.title,
        description: body.description,
        priority: body.priority,
        project_id: 10
      };
      createdTasks.push(task);
      return { status: 201, body: JSON.stringify(task) };
    }
    if (url.includes("/api/v1/projects")) {
      const proj = {
        id: 10,
        title: body.title,
        description: body.description
      };
      createdProjects.push(proj);
      return { status: 201, body: JSON.stringify(proj) };
    }
    return { status: 200, body: "{}" };
  }
};

try {
  const vikunja = require("../modules/vikunja");
  const config = { url: "https://vikunja.test", token: "test_token" };

  // 1. Test getProjects when empty
  const initialProjects = vikunja.getProjects(config);
  assert.strictEqual(Array.isArray(initialProjects), true);
  assert.strictEqual(initialProjects.length, 0);

  // 2. Test ensureProject auto-creates project when missing
  const projId = vikunja.ensureProject(config, mockStorage, {
    redmineProjectId: 55,
    projectName: "Core App"
  });
  assert.strictEqual(projId, 10);
  assert.strictEqual(createdProjects.length, 1);
  assert.strictEqual(createdProjects[0].title, "Core App");

  // Check that mockStorage has the cache saved
  const cachedMap = mockStorage.get("redmine_project_map");
  assert.strictEqual(typeof cachedMap, "object");
  assert.strictEqual(cachedMap[55], 10);

  // 3. Test ensureProject returns cached ID on subsequent calls without creating duplicates
  const httpCallsBefore = httpCallHistory.length;
  const cachedProjId = vikunja.ensureProject(config, mockStorage, {
    redmineProjectId: 55,
    projectName: "Core App"
  });
  assert.strictEqual(cachedProjId, 10);
  assert.strictEqual(createdProjects.length, 1); // No new projects created
  assert.strictEqual(httpCallHistory.length, httpCallsBefore); // No new HTTP calls made because it hit cache

  // 4. Test ensureProject with cache cleared matches existing project title (case-insensitive)
  mockStorage.delete("redmine_project_map");
  const matchedProjId = vikunja.ensureProject(config, mockStorage, {
    redmineProjectId: 55,
    projectName: "core app" // lowercase to test case-insensitivity
  });
  assert.strictEqual(matchedProjId, 10);
  assert.strictEqual(createdProjects.length, 1); // Found existing project, no duplicate created
  // Check that mockStorage re-cached the project
  const reCachedMap = mockStorage.get("redmine_project_map");
  assert.strictEqual(reCachedMap[55], 10);

  // 5. Test createProject directly
  const customProj = vikunja.createProject(config, {
    title: "Secondary Project",
    description: "Another project"
  });
  assert.strictEqual(customProj.title, "Secondary Project");
  assert.strictEqual(createdProjects.length, 2);

  // 6. Test createTask in project
  const task = vikunja.createTask(config, projId, {
    title: "[#105] Fix login button",
    description: "Description",
    priority: 3
  });
  assert.strictEqual(task.id, 88);
  assert.strictEqual(task.title, "[#105] Fix login button");
  assert.strictEqual(task.project_id, 10);
  assert.strictEqual(createdTasks.length, 1);

  // 7. Test updateTask
  const updatedTask = vikunja.updateTask(config, 88, {
    done: true,
    title: "[#105] Fix login button (Resolved)"
  });
  assert.strictEqual(updatedTask.id, 88);
  assert.strictEqual(updatedTask.done, true);
  assert.strictEqual(updatedTask.title, "[#105] Fix login button (Resolved)");

  console.log("All vikunja client tests passed!");
} finally {
  if (originalHttp !== undefined) {
    global.http = originalHttp;
  } else {
    delete global.http;
  }
}
