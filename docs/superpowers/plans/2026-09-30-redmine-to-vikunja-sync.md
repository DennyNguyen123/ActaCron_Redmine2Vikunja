# Redmine to Vikunja Sync & AI MCP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, 1-way synchronization pipeline from Redmine issues (via saved Query ID) to Vikunja tasks with automatic project creation, 1-1 reference integrity, direct attachment links, and dynamic MCP tools for AI Agents to inspect and safely update Redmine issues.

**Architecture:** Modular architecture in an ActaCron package:
- `modules/http.js`: Common HTTP client supporting GET, POST, PUT, DELETE.
- `modules/mapper.js`: Pure transformation logic mapping Redmine issues to Vikunja task payloads.
- `modules/redmine.js`: Redmine REST API client.
- `modules/vikunja.js`: Vikunja REST API client with project auto-provisioning.
- `modules/sync_engine.js`: Synchronization orchestrator with SQLite state tracking and dry-run support.
- `redmine_to_vikunja_sync.js`: Scheduled cron job (`@cron 0/15 * * * *`).
- `redmine_mcp.js`: Dynamic MCP tools for AI Agents (`@mcp true`).

**Tech Stack:** JavaScript (ES6 baseline in ActaCron Goja Sandbox / Node.js test harness), ActaCron runtime APIs (`http`, `storage`, `env`, `console`).

**Spec:** [docs/superpowers/specs/2026-09-30-redmine-to-vikunja-sync-design.md](file:///d:/Personal_Sources/ActaCron_Redmine2Vikunja/docs/superpowers/specs/2026-09-30-redmine-to-vikunja-sync-design.md)

## Global Constraints
- Every script in the workspace root must be valid JavaScript syntax and conform to `scripts/validate.js`.
- Never use `*/` inside JSDoc comment blocks (e.g. use `@cron 0/15 * * * *`, NOT `*/15`).
- Root scripts must expose `function main(params)`.
- Zero external npm runtime dependencies inside `modules/` and root scripts (uses standard JS and ActaCron injected globals).
- Attachments from Redmine must be formatted as direct URL links; no binary files downloaded to Vikunja.

## Review Focus
1. **Redmine Issue without description or attachments:** Must format gracefully without `undefined` or null pointer errors.
2. **Vikunja Project creation idempotency:** If project exists in Vikunja or SQLite cache, must not create duplicate projects.
3. **HTTP error handling:** Network failures or non-200 responses from Redmine or Vikunja must throw descriptive errors rather than crashing the engine.
4. **Update vs Insert decision:** Issue state comparison using `updated_on` must skip unchanged tasks and update modified tasks properly.
5. **JSDoc annotation validity:** JSDoc in `redmine_to_vikunja_sync.js` and `redmine_mcp.js` must pass `node scripts/validate.js` cleanly.

---

### Task 1: HTTP Client Abstraction (`modules/http.js`)

**Files:**
- Create: `modules/http.js`
- Test: `tests/test_http.js`

**Interfaces:**
- Consumes: Global `http` or `fetch` object, or Node.js runtime globals during unit testing.
- Produces: `request(method, url, options)`: `{ status: number, data: any, headers: object }`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_http.js`:
```javascript
const assert = require("assert");

// Mock global http if running in pure node test environment
if (typeof global.http === "undefined") {
  global.http = {
    get: function(url, headers) {
      if (url.includes("/error")) return { status: 500, body: JSON.stringify({ error: "server error" }) };
      return { status: 200, body: JSON.stringify({ message: "get ok", url: url }) };
    },
    post: function(url, body, headers) {
      return { status: 201, body: JSON.stringify({ message: "post ok", received: body }) };
    },
    put: function(url, body, headers) {
      return { status: 200, body: JSON.stringify({ message: "put ok", received: body }) };
    }
  };
}

const httpClient = require("../modules/http");

console.log("Testing modules/http.js...");

// Test GET
const getRes = httpClient.get("https://api.example.com/test", { "X-Custom": "test" });
assert.strictEqual(getRes.status, 200);
assert.strictEqual(getRes.data.message, "get ok");

// Test POST
const postRes = httpClient.post("https://api.example.com/items", { title: "Item 1" });
assert.strictEqual(postRes.status, 201);
assert.strictEqual(postRes.data.message, "post ok");

// Test PUT
const putRes = httpClient.put("https://api.example.com/items/1", { title: "Updated" });
assert.strictEqual(putRes.status, 200);
assert.strictEqual(putRes.data.message, "put ok");

// Test Error handling
assert.throws(() => {
  httpClient.get("https://api.example.com/error");
}, /HTTP 500/);

console.log("All HTTP tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_http.js`
Expected: FAIL with `Cannot find module '../modules/http'`

- [ ] **Step 3: Write minimal implementation**

Create `modules/http.js`:
```javascript
/**
 * Universal HTTP client abstraction for ActaCron and Node.js environments.
 */

function buildHeaders(customHeaders) {
  var headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  if (customHeaders) {
    for (var k in customHeaders) {
      if (customHeaders.hasOwnProperty(k)) {
        headers[k] = customHeaders[k];
      }
    }
  }
  return headers;
}

function parseResponseBody(bodyStr) {
  if (!bodyStr || typeof bodyStr !== "string") {
    return null;
  }
  var trimmed = bodyStr.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    return bodyStr;
  }
}

function request(method, url, options) {
  options = options || {};
  var headers = buildHeaders(options.headers);
  var body = options.body;
  var verb = (method || "GET").toUpperCase();
  var res = null;

  if (typeof http !== "undefined") {
    if (verb === "GET") {
      res = http.get(url, headers);
    } else if (verb === "POST") {
      res = http.post(url, body, headers);
    } else if (verb === "PUT" && typeof http.put === "function") {
      res = http.put(url, body, headers);
    } else if (verb === "DELETE" && typeof http.delete === "function") {
      res = http.delete(url, headers);
    } else if (verb === "PUT") {
      // Fallback: POST with method override header
      headers["X-HTTP-Method-Override"] = "PUT";
      res = http.post(url, body, headers);
    } else {
      throw new Error("Unsupported HTTP method: " + verb);
    }
  } else {
    throw new Error("No HTTP execution runtime available");
  }

  if (!res) {
    throw new Error("HTTP request failed: null response returned for " + verb + " " + url);
  }

  var parsedData = parseResponseBody(res.body);

  if (res.status < 200 || res.status >= 300) {
    var errMsg = "HTTP " + res.status + " on " + verb + " " + url;
    if (parsedData && typeof parsedData === "object" && parsedData.message) {
      errMsg += ": " + parsedData.message;
    } else if (typeof res.body === "string" && res.body.length > 0) {
      errMsg += ": " + res.body.substring(0, 200);
    }
    var err = new Error(errMsg);
    err.status = res.status;
    err.data = parsedData;
    throw err;
  }

  return {
    status: res.status,
    data: parsedData,
    rawBody: res.body
  };
}

module.exports = {
  request: request,
  get: function(url, headers) {
    return request("GET", url, { headers: headers });
  },
  post: function(url, body, headers) {
    return request("POST", url, { body: body, headers: headers });
  },
  put: function(url, body, headers) {
    return request("PUT", url, { body: body, headers: headers });
  },
  delete: function(url, headers) {
    return request("DELETE", url, { headers: headers });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_http.js`
Expected: PASS with `All HTTP tests passed!`

- [ ] **Step 5: Commit**

```bash
git add modules/http.js tests/test_http.js
git commit -m "feat: add http client abstraction module"
```

---

### Task 2: Data Transformation & Mapping (`modules/mapper.js`)

**Files:**
- Create: `modules/mapper.js`
- Test: `tests/test_mapper.js`

**Interfaces:**
- Consumes: Redmine issue objects and optional Redmine base URL.
- Produces:
  - `formatTitle(issue)`: string `[#123] Subject`
  - `formatDescription(issue, redmineUrl)`: string (Markdown formatted with link, metadata, body, and attachment links)
  - `mapPriority(priorityId)`: number 1..5
  - `isIssueClosed(issue)`: boolean

- [ ] **Step 1: Write the failing test**

Create `tests/test_mapper.js`:
```javascript
const assert = require("assert");
const mapper = require("../modules/mapper");

console.log("Testing modules/mapper.js...");

const mockIssue = {
  id: 105,
  subject: "Fix login button styling",
  description: "The login button is misaligned on mobile screens.",
  status: { id: 2, name: "In Progress", is_closed: false },
  priority: { id: 4, name: "Urgent" },
  author: { id: 1, name: "Admin User" },
  assigned_to: { id: 5, name: "Dev Jane" },
  start_date: "2026-10-01",
  due_date: "2026-10-05",
  done_ratio: 50,
  attachments: [
    {
      id: 201,
      filename: "screenshot.png",
      filesize: 1048576,
      description: "Bug screenshot"
    }
  ]
};

// 1. Title
const title = mapper.formatTitle(mockIssue);
assert.strictEqual(title, "[#105] Fix login button styling");

// 2. Priority
assert.strictEqual(mapper.mapPriority({ id: 1 }), 1); // Low
assert.strictEqual(mapper.mapPriority({ id: 2 }), 2); // Normal
assert.strictEqual(mapper.mapPriority({ id: 4 }), 4); // Urgent
assert.strictEqual(mapper.mapPriority({ id: 5 }), 5); // Immediate
assert.strictEqual(mapper.mapPriority(null), 2); // Default to Normal

// 3. Status
assert.strictEqual(mapper.isIssueClosed(mockIssue), false);
assert.strictEqual(mapper.isIssueClosed({ status: { id: 5, is_closed: true } }), true);
assert.strictEqual(mapper.isIssueClosed({ status: { name: "Closed" } }), true);

// 4. Description & Attachments link
const desc = mapper.formatDescription(mockIssue, "https://redmine.example.com");
assert.ok(desc.includes("[Issue #105](https://redmine.example.com/issues/105)"));
assert.ok(desc.includes("The login button is misaligned on mobile screens."));
assert.ok(desc.includes("screenshot.png"));
assert.ok(desc.includes("https://redmine.example.com/attachments/download/201/screenshot.png"));
assert.ok(!desc.includes("undefined"));

console.log("All mapper tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_mapper.js`
Expected: FAIL with `Cannot find module '../modules/mapper'`

- [ ] **Step 3: Write minimal implementation**

Create `modules/mapper.js`:
```javascript
/**
 * Data transformation rules between Redmine issues and Vikunja tasks.
 */

function formatTitle(issue) {
  if (!issue || !issue.id) return "";
  var subject = issue.subject || "(No Subject)";
  return "[#" + issue.id + "] " + subject;
}

function mapPriority(priority) {
  if (!priority) return 2; // Default to Normal/Medium
  var id = typeof priority === "object" ? priority.id : priority;
  switch (Number(id)) {
    case 1: return 1; // Low
    case 2: return 2; // Normal
    case 3: return 3; // High
    case 4: return 4; // Urgent
    case 5: return 5; // Immediate / DO NOW
    default: return 2;
  }
}

function isIssueClosed(issue) {
  if (!issue || !issue.status) return false;
  var status = issue.status;
  if (status.is_closed === true) return true;
  var name = (status.name || "").toLowerCase();
  return name === "closed" || name === "resolved" || name === "rejected";
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  var k = 1024;
  var sizes = ["B", "KB", "MB", "GB"];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDescription(issue, redmineUrl) {
  if (!issue) return "";
  var base = (redmineUrl || "").replace(/\/+$/, "");
  var lines = [];

  // Redmine Reference Header
  var issueUrl = base ? base + "/issues/" + issue.id : "#" + issue.id;
  lines.push("**Redmine Link:** [" + (base ? "Issue #" + issue.id : "Issue #" + issue.id) + "](" + issueUrl + ")");
  lines.push("");

  // Metadata block
  lines.push("> **Status:** " + (issue.status ? issue.status.name : "N/A") +
    " | **Priority:** " + (issue.priority ? issue.priority.name : "N/A") +
    (issue.done_ratio !== undefined ? " | **Done:** " + issue.done_ratio + "%" : ""));
  if (issue.assigned_to) {
    lines.push("> **Assignee:** " + issue.assigned_to.name);
  }
  if (issue.author) {
    lines.push("> **Author:** " + issue.author.name);
  }
  lines.push("");

  // Main issue description
  lines.push("### Description");
  if (issue.description && issue.description.trim().length > 0) {
    lines.push(issue.description.trim());
  } else {
    lines.push("*(No description provided in Redmine)*");
  }
  lines.push("");

  // Attachments section (Links only, no binary download)
  if (issue.attachments && issue.attachments.length > 0) {
    lines.push("### Attachments");
    for (var i = 0; i < issue.attachments.length; i++) {
      var att = issue.attachments[i];
      var downloadUrl = base ? base + "/attachments/download/" + att.id + "/" + encodeURIComponent(att.filename) : "#";
      var sizeStr = att.filesize ? " (" + formatBytes(att.filesize) + ")" : "";
      var note = att.description ? " - *" + att.description + "*" : "";
      lines.push("- [" + att.filename + "](" + downloadUrl + ")" + sizeStr + note);
    }
    lines.push("");
  }

  return lines.join("\n");
}

module.exports = {
  formatTitle: formatTitle,
  mapPriority: mapPriority,
  isIssueClosed: isIssueClosed,
  formatDescription: formatDescription
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_mapper.js`
Expected: PASS with `All mapper tests passed!`

- [ ] **Step 5: Commit**

```bash
git add modules/mapper.js tests/test_mapper.js
git commit -m "feat: add data transformation and formatting mapper"
```

---

### Task 3: Redmine API Client (`modules/redmine.js`)

**Files:**
- Create: `modules/redmine.js`
- Test: `tests/test_redmine.js`

**Interfaces:**
- Consumes: `modules/http.js`, Redmine configuration (`url`, `apiKey`).
- Produces:
  - `getIssuesByQuery(config, options)`: `{ issues: Array, total_count: number }`
  - `getIssue(config, issueId)`: `{ issue: Object }`
  - `updateIssue(config, issueId, fields)`: `{ issue: Object }`

- [ ] **Step 1: Write the failing test**

Create `tests/test_redmine.js`:
```javascript
const assert = require("assert");

// Mock global http
global.http = {
  get: function(url, headers) {
    assert.strictEqual(headers["X-Redmine-API-Key"], "test_redmine_key");
    if (url.includes("/issues.json?query_id=12")) {
      return {
        status: 200,
        body: JSON.stringify({
          issues: [{ id: 101, subject: "Test Query Issue" }],
          total_count: 1
        })
      };
    }
    if (url.includes("/issues/101.json")) {
      return {
        status: 200,
        body: JSON.stringify({
          issue: { id: 101, subject: "Detail Issue", description: "Body" }
        })
      };
    }
    return { status: 404, body: "{}" };
  },
  post: function(url, body, headers) {
    assert.strictEqual(headers["X-Redmine-API-Key"], "test_redmine_key");
    return {
      status: 200,
      body: JSON.stringify({ issue: { id: 101, notes: body.issue.notes } })
    };
  }
};

const redmine = require("../modules/redmine");
const config = { url: "https://redmine.test", apiKey: "test_redmine_key" };

console.log("Testing modules/redmine.js...");

// 1. Get issues by query
const resQuery = redmine.getIssuesByQuery(config, { queryId: 12, limit: 10 });
assert.strictEqual(resQuery.issues.length, 1);
assert.strictEqual(resQuery.issues[0].id, 101);

// 2. Get single issue
const resDetail = redmine.getIssue(config, 101);
assert.strictEqual(resDetail.issue.id, 101);
assert.strictEqual(resDetail.issue.description, "Body");

// 3. Update issue
const resUpdate = redmine.updateIssue(config, 101, { notes: "AI Agent finished task", status_id: 3 });
assert.strictEqual(resUpdate.issue.notes, "AI Agent finished task");

console.log("All redmine client tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_redmine.js`
Expected: FAIL with `Cannot find module '../modules/redmine'`

- [ ] **Step 3: Write minimal implementation**

Create `modules/redmine.js`:
```javascript
/**
 * Redmine REST API client module.
 */
var httpClient = require("./http");

function cleanUrl(url) {
  return (url || "").replace(/\/+$/, "");
}

function getHeaders(apiKey) {
  var headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  if (apiKey) {
    headers["X-Redmine-API-Key"] = apiKey;
  }
  return headers;
}

function getIssuesByQuery(config, options) {
  options = options || {};
  var baseUrl = cleanUrl(config.url);
  var queryId = options.queryId;
  var limit = options.limit || 50;
  var offset = options.offset || 0;

  if (!queryId) {
    throw new Error("Redmine queryId is required to fetch issues");
  }

  var endpoint = baseUrl + "/issues.json?query_id=" + encodeURIComponent(queryId) +
    "&limit=" + encodeURIComponent(limit) +
    "&offset=" + encodeURIComponent(offset) +
    "&include=attachments";

  var res = httpClient.get(endpoint, getHeaders(config.apiKey));
  return res.data;
}

function getIssue(config, issueId, options) {
  options = options || {};
  var baseUrl = cleanUrl(config.url);
  var includeStr = (options.include && options.include.join(",")) || "attachments,journals,relations";
  var endpoint = baseUrl + "/issues/" + encodeURIComponent(issueId) + ".json?include=" + encodeURIComponent(includeStr);

  var res = httpClient.get(endpoint, getHeaders(config.apiKey));
  return res.data;
}

function updateIssue(config, issueId, fields) {
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/issues/" + encodeURIComponent(issueId) + ".json";

  var payload = {
    issue: fields || {}
  };

  var res = httpClient.put(endpoint, payload, getHeaders(config.apiKey));
  return res.data;
}

module.exports = {
  getIssuesByQuery: getIssuesByQuery,
  getIssue: getIssue,
  updateIssue: updateIssue
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_redmine.js`
Expected: PASS with `All redmine client tests passed!`

- [ ] **Step 5: Commit**

```bash
git add modules/redmine.js tests/test_redmine.js
git commit -m "feat: add redmine rest api client module"
```

---

### Task 4: Vikunja API Client with Project Auto-Creation (`modules/vikunja.js`)

**Files:**
- Create: `modules/vikunja.js`
- Test: `tests/test_vikunja.js`

**Interfaces:**
- Consumes: `modules/http.js`, Vikunja configuration (`url`, `token`), ActaCron persistent storage.
- Produces:
  - `getProjects(config)`: Array of projects
  - `createProject(config, { title, description })`: Object project
  - `ensureProject(config, storage, { redmineProjectId, projectName })`: number projectId
  - `createTask(config, projectId, taskPayload)`: Object task
  - `updateTask(config, taskId, taskPayload)`: Object task

- [ ] **Step 1: Write the failing test**

Create `tests/test_vikunja.js`:
```javascript
const assert = require("assert");

// In-memory mock storage
const mockStore = {};
const mockStorage = {
  get: (k) => mockStore[k] || null,
  set: (k, v) => { mockStore[k] = v; },
  delete: (k) => { delete mockStore[k]; }
};

// Mock global http
let createdProjects = [];
let createdTasks = [];

global.http = {
  get: function(url, headers) {
    assert.strictEqual(headers["Authorization"], "Bearer test_vikunja_token");
    if (url.includes("/api/v1/projects")) {
      return { status: 200, body: JSON.stringify(createdProjects) };
    }
    return { status: 404, body: "{}" };
  },
  post: function(url, body, headers) {
    assert.strictEqual(headers["Authorization"], "Bearer test_vikunja_token");
    if (url.includes("/api/v1/tasks/")) {
      return { status: 200, body: JSON.stringify({ id: 99, title: body.title }) };
    }
    return { status: 201, body: JSON.stringify({ id: 99, title: body.title }) };
  },
  put: function(url, body, headers) {
    assert.strictEqual(headers["Authorization"], "Bearer test_vikunja_token");
    if (url.includes("/api/v1/projects/") && url.includes("/tasks")) {
      const task = { id: 88, title: body.title, project_id: 10 };
      createdTasks.push(task);
      return { status: 201, body: JSON.stringify(task) };
    }
    if (url.includes("/api/v1/projects")) {
      const proj = { id: 10, title: body.title, description: body.description };
      createdProjects.push(proj);
      return { status: 201, body: JSON.stringify(proj) };
    }
    return { status: 200, body: "{}" };
  }
};

const vikunja = require("../modules/vikunja");
const config = { url: "https://vikunja.test", token: "test_vikunja_token" };

console.log("Testing modules/vikunja.js...");

// 1. Ensure project auto-creates if missing
const projId = vikunja.ensureProject(config, mockStorage, {
  redmineProjectId: 55,
  projectName: "Core App"
});
assert.strictEqual(projId, 10);
assert.strictEqual(createdProjects.length, 1);
assert.strictEqual(createdProjects[0].title, "Core App");

// Verify storage caching (second call should not create project again)
const cachedProjId = vikunja.ensureProject(config, mockStorage, {
  redmineProjectId: 55,
  projectName: "Core App"
});
assert.strictEqual(cachedProjId, 10);
assert.strictEqual(createdProjects.length, 1); // Still 1

// 2. Create task in project
const task = vikunja.createTask(config, projId, {
  title: "[#105] Fix login button",
  description: "Description",
  priority: 3
});
assert.strictEqual(task.id, 88);
assert.strictEqual(task.title, "[#105] Fix login button");

// 3. Update task
const updated = vikunja.updateTask(config, 88, { done: true });
assert.strictEqual(updated.id, 99);

console.log("All vikunja client tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_vikunja.js`
Expected: FAIL with `Cannot find module '../modules/vikunja'`

- [ ] **Step 3: Write minimal implementation**

Create `modules/vikunja.js`:
```javascript
/**
 * Vikunja REST API client module with project auto-provisioning.
 */
var httpClient = require("./http");

function cleanUrl(url) {
  return (url || "").replace(/\/+$/, "");
}

function getHeaders(token) {
  var headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return headers;
}

function getProjects(config) {
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/projects";
  var res = httpClient.get(endpoint, getHeaders(config.token));
  return Array.isArray(res.data) ? res.data : [];
}

function createProject(config, projectData) {
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/projects";
  var payload = {
    title: projectData.title,
    description: projectData.description || ""
  };
  var res = httpClient.put(endpoint, payload, getHeaders(config.token));
  return res.data;
}

function ensureProject(config, storage, options) {
  options = options || {};
  var redmineProjectId = options.redmineProjectId;
  var projectName = options.projectName || ("Redmine Project #" + redmineProjectId);

  // 1. Check persistent SQLite cache
  var cacheKey = "redmine_project_map";
  var projMap = null;
  if (storage && typeof storage.get === "function") {
    projMap = storage.get(cacheKey);
  }
  if (!projMap || typeof projMap !== "object") {
    projMap = {};
  }

  if (redmineProjectId && projMap[redmineProjectId]) {
    return projMap[redmineProjectId];
  }

  // 2. Fetch existing Vikunja projects to check for title match
  var projects = getProjects(config);
  for (var i = 0; i < projects.length; i++) {
    if (projects[i].title && projects[i].title.toLowerCase() === projectName.toLowerCase()) {
      var matchedId = projects[i].id;
      if (redmineProjectId && storage && typeof storage.set === "function") {
        projMap[redmineProjectId] = matchedId;
        storage.set(cacheKey, projMap);
      }
      return matchedId;
    }
  }

  // 3. Create new project in Vikunja
  var newProj = createProject(config, {
    title: projectName,
    description: "Synchronized from Redmine Project #" + redmineProjectId
  });

  var newProjId = newProj.id;
  if (redmineProjectId && storage && typeof storage.set === "function") {
    projMap[redmineProjectId] = newProjId;
    storage.set(cacheKey, projMap);
  }

  return newProjId;
}

function createTask(config, projectId, taskPayload) {
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/projects/" + encodeURIComponent(projectId) + "/tasks";
  var res = httpClient.put(endpoint, taskPayload, getHeaders(config.token));
  return res.data;
}

function updateTask(config, taskId, taskPayload) {
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/tasks/" + encodeURIComponent(taskId);
  var res = httpClient.post(endpoint, taskPayload, getHeaders(config.token));
  return res.data;
}

module.exports = {
  getProjects: getProjects,
  createProject: createProject,
  ensureProject: ensureProject,
  createTask: createTask,
  updateTask: updateTask
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_vikunja.js`
Expected: PASS with `All vikunja client tests passed!`

- [ ] **Step 5: Commit**

```bash
git add modules/vikunja.js tests/test_vikunja.js
git commit -m "feat: add vikunja api client with project auto-sync"
```

---

### Task 5: Core Sync Orchestration Engine (`modules/sync_engine.js`)

**Files:**
- Create: `modules/sync_engine.js`
- Test: `tests/test_sync_engine.js`

**Interfaces:**
- Consumes: `modules/redmine.js`, `modules/vikunja.js`, `modules/mapper.js`, ActaCron `storage`.
- Produces: `runSync(params)`: `{ status: "ok", created: number, updated: number, skipped: number, total: number }`

- [ ] **Step 1: Write the failing test**

Create `tests/test_sync_engine.js`:
```javascript
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

// Second Sync with unchanged issues: should skip 2 tasks
const res2 = syncEngine.runSync({
  redmine: { url: "https://redmine.test", apiKey: "key", queryId: 1 },
  vikunja: { url: "https://vikunja.test", token: "tok" },
  storage: mockStorage
});

assert.strictEqual(res2.created, 0);
assert.strictEqual(res2.updated, 0);
assert.strictEqual(res2.skipped, 2);

console.log("All sync engine tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_sync_engine.js`
Expected: FAIL with `Cannot find module '../modules/sync_engine'`

- [ ] **Step 3: Write minimal implementation**

Create `modules/sync_engine.js`:
```javascript
/**
 * Core synchronization pipeline between Redmine and Vikunja.
 */
var redmineClient = require("./redmine");
var vikunjaClient = require("./vikunja");
var mapper = require("./mapper");

function runSync(options) {
  options = options || {};
  var redmineConfig = options.redmine || {};
  var vikunjaConfig = options.vikunja || {};
  var storage = options.storage;
  var dryRun = options.dryRun === true;

  if (!redmineConfig.url || !redmineConfig.apiKey || !redmineConfig.queryId) {
    throw new Error("Missing Redmine configuration (url, apiKey, queryId)");
  }
  if (!vikunjaConfig.url || !vikunjaConfig.token) {
    throw new Error("Missing Vikunja configuration (url, token)");
  }

  var limit = options.limit || 50;
  var queryRes = redmineClient.getIssuesByQuery(redmineConfig, {
    queryId: redmineConfig.queryId,
    limit: limit
  });

  var issues = queryRes.issues || [];
  var result = {
    status: "ok",
    total: issues.length,
    created: 0,
    updated: 0,
    skipped: 0,
    dry_run: dryRun,
    synced_issues: []
  };

  // Load existing state map from persistent storage
  var issueMapKey = "redmine_issue_map";
  var issueMap = {};
  if (storage && typeof storage.get === "function") {
    var stored = storage.get(issueMapKey);
    if (stored && typeof stored === "object") {
      issueMap = stored;
    }
  }

  for (var i = 0; i < issues.length; i++) {
    var issue = issues[i];
    var issueId = String(issue.id);
    var redmineProj = issue.project || { id: 0, name: "Default" };
    var updatedOn = issue.updated_on || "";

    // Check if task exists and is up to date
    var existingRecord = issueMap[issueId];
    if (existingRecord && existingRecord.last_updated_on === updatedOn) {
      result.skipped++;
      continue;
    }

    // Ensure Vikunja Project
    var vikunjaProjectId = 0;
    if (!dryRun) {
      vikunjaProjectId = vikunjaClient.ensureProject(vikunjaConfig, storage, {
        redmineProjectId: redmineProj.id,
        projectName: redmineProj.name
      });
    }

    var taskPayload = {
      title: mapper.formatTitle(issue),
      description: mapper.formatDescription(issue, redmineConfig.url),
      priority: mapper.mapPriority(issue.priority),
      done: mapper.isIssueClosed(issue)
    };

    if (issue.due_date) {
      taskPayload.due_date = issue.due_date + "T23:59:59Z";
    }
    if (issue.start_date) {
      taskPayload.start_date = issue.start_date + "T00:00:00Z";
    }

    if (dryRun) {
      result.synced_issues.push({ issue_id: issue.id, action: existingRecord ? "would_update" : "would_create" });
      if (existingRecord) result.updated++; else result.created++;
      continue;
    }

    if (existingRecord && existingRecord.vikunja_task_id) {
      // Update existing task
      vikunjaClient.updateTask(vikunjaConfig, existingRecord.vikunja_task_id, taskPayload);
      existingRecord.last_updated_on = updatedOn;
      existingRecord.synced_at = new Date().toISOString();
      result.updated++;
      result.synced_issues.push({ issue_id: issue.id, action: "updated", task_id: existingRecord.vikunja_task_id });
    } else {
      // Create new task
      var createdTask = vikunjaClient.createTask(vikunjaConfig, vikunjaProjectId, taskPayload);
      issueMap[issueId] = {
        vikunja_task_id: createdTask.id,
        last_updated_on: updatedOn,
        synced_at: new Date().toISOString()
      };
      result.created++;
      result.synced_issues.push({ issue_id: issue.id, action: "created", task_id: createdTask.id });
    }
  }

  // Persist updated map back to SQLite
  if (!dryRun && storage && typeof storage.set === "function") {
    storage.set(issueMapKey, issueMap);
  }

  return result;
}

module.exports = {
  runSync: runSync
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_sync_engine.js`
Expected: PASS with `All sync engine tests passed!`

- [ ] **Step 5: Commit**

```bash
git add modules/sync_engine.js tests/test_sync_engine.js
git commit -m "feat: add sync engine orchestrator with state persistence"
```

---

### Task 6: Scheduled Background Job (`redmine_to_vikunja_sync.js`)

**Files:**
- Create: `redmine_to_vikunja_sync.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: ActaCron injected globals (`env`, `storage`, `console`), `modules/sync_engine.js`.
- Produces: `function main(params)`: execution summary result object.

- [ ] **Step 1: Write `redmine_to_vikunja_sync.js` with compliant JSDoc**

Create `redmine_to_vikunja_sync.js`:
```javascript
/**
 * @name redmine_to_vikunja_sync
 * @cron 0/15 * * * *
 * @timeout 120
 * @mcp false
 * @description Periodically synchronizes tasks from Redmine query to Vikunja projects with 1-1 reference integrity.
 * @param {boolean} dry_run - Run sync without creating or updating tasks
 * @param {number} limit - Maximum number of issues to fetch per run (default: 50)
 */
function main(params) {
  params = params || {};
  var syncEngine = require("./modules/sync_engine");

  var redmineUrl = (typeof env === "function" ? env("REDMINE_URL") : "") || (typeof process !== "undefined" && process.env.REDMINE_URL);
  var redmineApiKey = (typeof env === "function" ? env("REDMINE_API_KEY") : "") || (typeof process !== "undefined" && process.env.REDMINE_API_KEY);
  var redmineQueryId = (typeof env === "function" ? env("REDMINE_QUERY_ID") : "") || (typeof process !== "undefined" && process.env.REDMINE_QUERY_ID);

  var vikunjaUrl = (typeof env === "function" ? env("VIKUNJA_URL") : "") || (typeof process !== "undefined" && process.env.VIKUNJA_URL);
  var vikunjaToken = (typeof env === "function" ? env("VIKUNJA_API_TOKEN") : "") || (typeof process !== "undefined" && process.env.VIKUNJA_API_TOKEN);

  var limit = params.limit || (typeof env === "function" ? Number(env("SYNC_LIMIT")) : 50) || 50;
  var dryRun = params.dry_run === true;

  console.log("Starting Redmine -> Vikunja Sync (dry_run: " + dryRun + ", limit: " + limit + ")...");

  if (!redmineUrl || !redmineApiKey || !redmineQueryId) {
    throw new Error("Missing Redmine environment variables (REDMINE_URL, REDMINE_API_KEY, REDMINE_QUERY_ID)");
  }
  if (!vikunjaUrl || !vikunjaToken) {
    throw new Error("Missing Vikunja environment variables (VIKUNJA_URL, VIKUNJA_API_TOKEN)");
  }

  var storageClient = typeof storage !== "undefined" ? storage : null;

  var result = syncEngine.runSync({
    redmine: {
      url: redmineUrl,
      apiKey: redmineApiKey,
      queryId: redmineQueryId
    },
    vikunja: {
      url: vikunjaUrl,
      token: vikunjaToken
    },
    storage: storageClient,
    limit: limit,
    dryRun: dryRun
  });

  console.log("Sync complete! Created: " + result.created + ", Updated: " + result.updated + ", Skipped: " + result.skipped);
  return result;
}

if (typeof module !== "undefined") {
  module.exports = main;
}
```

- [ ] **Step 2: Update `.env.example`**

Modify `.env.example`:
```env
# Redmine Configuration
REDMINE_URL=https://redmine.example.com
REDMINE_API_KEY=your_redmine_api_key_here
REDMINE_QUERY_ID=12

# Vikunja Configuration
VIKUNJA_URL=https://vikunja.example.com
VIKUNJA_API_TOKEN=your_vikunja_personal_access_token_here

# Sync Settings
SYNC_LIMIT=50
LOG_LEVEL=info
```

- [ ] **Step 3: Validate syntax and JSDoc using `scripts/validate.js`**

Run: `node scripts/validate.js`
Expected: PASS for `redmine_to_vikunja_sync.js` without JSDoc or premature comment termination errors.

- [ ] **Step 4: Commit**

```bash
git add redmine_to_vikunja_sync.js .env.example
git commit -m "feat: add scheduled background sync script and env configuration"
```

---

### Task 7: AI Agent Dynamic MCP Tools (`redmine_mcp.js`)

**Files:**
- Create: `redmine_mcp.js`
- Test: `tests/test_mcp.js`

**Interfaces:**
- Consumes: `modules/redmine.js`, `modules/sync_engine.js`.
- Produces: `function main(params)` exposing actions:
  - `get_issue({ issue_id })`
  - `update_issue({ issue_id, notes, status_id, done_ratio })`
  - `sync_now({ dry_run })`

- [ ] **Step 1: Write the failing test**

Create `tests/test_mcp.js`:
```javascript
const assert = require("assert");

process.env.REDMINE_URL = "https://redmine.test";
process.env.REDMINE_API_KEY = "test_key";
process.env.REDMINE_QUERY_ID = "1";
process.env.VIKUNJA_URL = "https://vikunja.test";
process.env.VIKUNJA_API_TOKEN = "test_token";

global.http = {
  get: function(url) {
    if (url.includes("/issues/100.json")) {
      return { status: 200, body: JSON.stringify({ issue: { id: 100, subject: "Test Issue" } }) };
    }
    if (url.includes("/issues.json")) {
      return { status: 200, body: JSON.stringify({ issues: [] }) };
    }
    return { status: 404, body: "{}" };
  },
  put: function(url, body) {
    return { status: 200, body: JSON.stringify({ issue: { id: 100, status_id: body.issue.status_id } }) };
  }
};

const redmineMcp = require("../redmine_mcp");

console.log("Testing redmine_mcp.js...");

// 1. Get issue
const issueRes = redmineMcp({ action: "get_issue", issue_id: 100 });
assert.strictEqual(issueRes.status, "ok");
assert.strictEqual(issueRes.data.issue.id, 100);

// 2. Update issue with validation
const updateRes = redmineMcp({
  action: "update_issue",
  issue_id: 100,
  status_id: 3,
  notes: "Task completed"
});
assert.strictEqual(updateRes.status, "ok");

// 3. Validation error on missing ID
assert.throws(() => {
  redmineMcp({ action: "get_issue" });
}, /Missing issue_id/);

console.log("All MCP tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_mcp.js`
Expected: FAIL with `Cannot find module '../redmine_mcp'`

- [ ] **Step 3: Write minimal implementation**

Create `redmine_mcp.js`:
```javascript
/**
 * @name redmine_mcp
 * @mcp true
 * @timeout 60
 * @description Dynamic MCP Tool for AI Agents to inspect issue context, apply controlled updates to Redmine, or trigger synchronization.
 * @param {string} action - Action: 'get_issue', 'update_issue', or 'sync_now'
 * @param {number} issue_id - Target Redmine Issue ID (required for get_issue and update_issue)
 * @param {string} notes - Comment / audit note for the issue update
 * @param {number} status_id - Target Redmine status ID
 * @param {number} done_ratio - Percentage completed (0-100)
 * @param {boolean} dry_run - Run sync in preview mode without changes
 */
function main(params) {
  params = params || {};
  var action = (params.action || "get_issue").toLowerCase();

  var redmineClient = require("./modules/redmine");
  var syncEngine = require("./modules/sync_engine");

  var redmineUrl = (typeof env === "function" ? env("REDMINE_URL") : "") || (typeof process !== "undefined" && process.env.REDMINE_URL);
  var redmineApiKey = (typeof env === "function" ? env("REDMINE_API_KEY") : "") || (typeof process !== "undefined" && process.env.REDMINE_API_KEY);
  var redmineQueryId = (typeof env === "function" ? env("REDMINE_QUERY_ID") : "") || (typeof process !== "undefined" && process.env.REDMINE_QUERY_ID);

  var redmineConfig = {
    url: redmineUrl,
    apiKey: redmineApiKey,
    queryId: redmineQueryId
  };

  if (!redmineConfig.url || !redmineConfig.apiKey) {
    throw new Error("Missing REDMINE_URL or REDMINE_API_KEY in environment");
  }

  if (action === "get_issue") {
    if (!params.issue_id) {
      throw new Error("Missing issue_id parameter");
    }
    console.log("AI Agent inspecting Redmine issue #" + params.issue_id);
    var issueData = redmineClient.getIssue(redmineConfig, params.issue_id);
    return {
      status: "ok",
      action: "get_issue",
      data: issueData
    };
  }

  if (action === "update_issue") {
    if (!params.issue_id) {
      throw new Error("Missing issue_id parameter");
    }
    var updateFields = {};
    if (params.notes) updateFields.notes = params.notes;
    if (params.status_id !== undefined) updateFields.status_id = Number(params.status_id);
    if (params.done_ratio !== undefined) {
      var ratio = Number(params.done_ratio);
      if (ratio < 0 || ratio > 100) throw new Error("done_ratio must be between 0 and 100");
      updateFields.done_ratio = ratio;
    }

    console.log("AI Agent updating Redmine issue #" + params.issue_id, JSON.stringify(updateFields));
    var updated = redmineClient.updateIssue(redmineConfig, params.issue_id, updateFields);
    return {
      status: "ok",
      action: "update_issue",
      issue_id: params.issue_id,
      updated_fields: updateFields,
      data: updated
    };
  }

  if (action === "sync_now") {
    var vikunjaUrl = (typeof env === "function" ? env("VIKUNJA_URL") : "") || (typeof process !== "undefined" && process.env.VIKUNJA_URL);
    var vikunjaToken = (typeof env === "function" ? env("VIKUNJA_API_TOKEN") : "") || (typeof process !== "undefined" && process.env.VIKUNJA_API_TOKEN);
    var storageClient = typeof storage !== "undefined" ? storage : null;

    var syncRes = syncEngine.runSync({
      redmine: redmineConfig,
      vikunja: { url: vikunjaUrl, token: vikunjaToken },
      storage: storageClient,
      dryRun: params.dry_run === true
    });

    return {
      status: "ok",
      action: "sync_now",
      summary: syncRes
    };
  }

  throw new Error("Unknown action '" + action + "'. Supported: 'get_issue', 'update_issue', 'sync_now'");
}

if (typeof module !== "undefined") {
  module.exports = main;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_mcp.js`
Expected: PASS with `All MCP tests passed!`

- [ ] **Step 5: Commit**

```bash
git add redmine_mcp.js tests/test_mcp.js
git commit -m "feat: add AI agent dynamic MCP tools for Redmine inspection and update"
```

---

### Task 8: Cleanup Template Demos, Documentation & Validation

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Delete: `hello_cron.js`, `api_fetcher.js`, `system_backup.js`, `shared_library_demo.js`, `cross_caller.js`

**Interfaces:**
- Runs: `npm test` / `node scripts/validate.js` ensuring 100% compliance.

- [ ] **Step 1: Remove obsolete template demonstration files**

```bash
git rm hello_cron.js api_fetcher.js system_backup.js shared_library_demo.js cross_caller.js
```

- [ ] **Step 2: Update `package.json` test script to run unit tests and validation**

Modify `package.json`:
```json
{
  "name": "actacron-redmine-to-vikunja",
  "version": "1.0.0",
  "description": "ActaCron package for 1-way synchronization from Redmine query to Vikunja and dynamic AI MCP tools",
  "main": "redmine_to_vikunja_sync.js",
  "scripts": {
    "test": "node tests/test_http.js && node tests/test_mapper.js && node tests/test_redmine.js && node tests/test_vikunja.js && node tests/test_sync_engine.js && node tests/test_mcp.js && node scripts/validate.js",
    "validate": "node scripts/validate.js"
  },
  "keywords": [
    "actacron",
    "redmine",
    "vikunja",
    "sync",
    "mcp",
    "ai-agent"
  ],
  "license": "MIT"
}
```

- [ ] **Step 3: Update `README.md` with complete usage instructions**

Update `README.md` explaining:
- Overview of Redmine to Vikunja synchronization.
- Setup steps (`.env` configuration).
- Scheduled Cron job details (`redmine_to_vikunja_sync.js`).
- AI Agent MCP tools usage (`redmine_mcp.js`).
- Testing and validation instructions.

- [ ] **Step 4: Run full test suite and validator**

Run: `npm test`
Expected: All unit tests PASS and `node scripts/validate.js` confirms all scripts pass validation without errors.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md
git commit -m "docs: finalize package documentation and test suite"
```
