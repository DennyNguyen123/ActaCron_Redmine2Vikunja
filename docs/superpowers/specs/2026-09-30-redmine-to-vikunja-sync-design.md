# Redmine to Vikunja Sync & AI MCP Tools Design Spec

**Date:** 2026-09-30  
**Target Repository:** `ActaCron_Redmine2Vikunja` (ActaCron Automation Package)  
**Execution Runtime:** ActaCron Engine (Goja JS Sandbox + SQLite KV + Dynamic MCP Hub)

---

## 1. Overview & Goals

This package provides a reliable, automated 1-way synchronization pipeline from Redmine issues (filtered by Query ID) to Vikunja tasks, along with a set of dynamic MCP (Model Context Protocol) tools for AI coding assistants to safely inspect and update Redmine issues.

### Key Objectives
1. **1-Way Background Cron Sync:**
   - Periodically execute via ActaCron scheduler (`@cron 0/15 * * * *`).
   - Query Redmine for issues matching a predefined Query ID.
   - Sync issues to Vikunja with 1-1 reference integrity.
2. **Automatic Project Sync:**
   - Detect project of incoming Redmine issues.
   - If the project does not exist in Vikunja, automatically create it and maintain a persistent ID mapping.
3. **1-1 Reference & Data Fidelity:**
   - Vikunja task titles prefixed with `[#<id>] <subject>`.
   - Task descriptions embed the original Redmine URL, metadata summary, and issue body.
   - Attachments from Redmine are linked directly (`${REDMINE_URL}/attachments/download/${id}/${filename}`) without downloading binary files.
   - Priority and completion status are accurately mapped.
4. **Idempotence & State Tracking:**
   - Store mapping records (`redmine_id -> vikunja_id`, project mappings, last sync timestamps) in ActaCron SQLite Key-Value storage (`storage.get` / `storage.set`) to prevent duplicate task creation.
5. **Controlled AI Agent MCP Tools:**
   - Dynamic MCP tools (`@mcp true`) allowing AI Agents to inspect issue context (`redmine_get_issue`), apply controlled updates with audit notes (`redmine_update_issue`), and manually trigger synchronization (`redmine_sync_now`).

---

## 2. System Architecture

```
ActaCron Engine (Goja Sandbox)
│
├── Scheduled Runner (Cron)
│     └── redmine_to_vikunja_sync.js (@cron 0/15 * * * *)
│           │
│           ├──> modules/redmine.js (GET /issues.json?query_id=...)
│           ├──> modules/mapper.js  (Transform issue & attachments to Vikunja format)
│           ├──> modules/vikunja.js (Ensure project, PUT/POST task)
│           └──> storage.get / storage.set (Track sync state & mappings)
│
└── MCP Hub (StdIO & SSE)
      └── redmine_mcp.js (@mcp true)
            │
            ├──> redmine_get_issue(params)    -> modules/redmine.js
            ├──> redmine_update_issue(params) -> modules/redmine.js
            └──> redmine_sync_now(params)     -> modules/sync_runner.js
```

---

## 3. Module Specifications

### 3.1 `modules/http.js` (HTTP Client Abstraction)
- Wraps `http.get`, `http.post`, and provides fallback mechanisms for `PUT` and `DELETE` requests (checking native `http.put` or falling back to CLI curl via `exec` if permitted).
- Handles JSON serialization/deserialization, query string encoding, and standard error handling.

### 3.2 `modules/redmine.js` (Redmine API Client)
- **`getIssuesByQuery({ queryId, limit, offset })`**:
  - `GET ${REDMINE_URL}/issues.json?query_id=${queryId}&limit=${limit}&offset=${offset}`
  - Header: `X-Redmine-API-Key: ${REDMINE_API_KEY}`
- **`getIssue({ issueId, include: ['attachments', 'journals', 'relations'] })`**:
  - `GET ${REDMINE_URL}/issues/${issueId}.json?include=attachments,journals`
- **`updateIssue({ issueId, notes, statusId, doneRatio, assignedToId })`**:
  - `PUT ${REDMINE_URL}/issues/${issueId}.json` (or POST with `X-HTTP-Method-Override: PUT`)
  - Body: `{ issue: { notes, status_id, done_ratio, assigned_to_id } }`

### 3.3 `modules/vikunja.js` (Vikunja API Client)
- **`getProjects()`**:
  - `GET ${VIKUNJA_URL}/api/v1/projects`
  - Header: `Authorization: Bearer ${VIKUNJA_API_TOKEN}`
- **`createProject({ title, description })`**:
  - `PUT ${VIKUNJA_URL}/api/v1/projects`
  - Body: `{ title, description }`
- **`ensureProject({ redmineProjectId, projectName })`**:
  - Checks SQLite cache `project_map` first. If missing, searches Vikunja projects by title. If not found, calls `createProject` and persists mapping.
- **`createTask({ projectId, title, description, dueDate, startDate, priority, done })`**:
  - `PUT ${VIKUNJA_URL}/api/v1/projects/${projectId}/tasks` (or `POST /api/v1/tasks`)
- **`updateTask({ taskId, title, description, dueDate, startDate, priority, done })`**:
  - `POST ${VIKUNJA_URL}/api/v1/tasks/${taskId}`

### 3.4 `modules/mapper.js` (Data Transformation)
- **Title Mapping:**
  - `[#${issue.id}] ${issue.subject}`
- **Description & Attachments Formatting:**
  - Header with clickable Redmine link: `**Redmine:** [Issue #${issue.id}](${redmineUrl}/issues/${issue.id})`
  - Project, Tracker, Status, Author, Assignee blockquote.
  - Issue description content.
  - Attachment section formatting:
    ```markdown
    ### Attachments
    - [document.pdf](https://redmine.example.com/attachments/download/123/document.pdf) (1.2 MB)
    ```
- **Priority Mapping:**
  - Redmine 1 (Low) -> Vikunja 1
  - Redmine 2 (Normal) -> Vikunja 2
  - Redmine 3 (High) -> Vikunja 3
  - Redmine 4 (Urgent) -> Vikunja 4
  - Redmine 5 (Immediate) -> Vikunja 5
- **Status Mapping:**
  - Redmine closed status (e.g. `is_closed: true` or status name `Closed`, `Resolved`) -> Vikunja `done = true`, otherwise `done = false`.

---

## 4. State Storage & Idempotency (`storage.get` / `storage.set`)

Scoped to this ActaCron package via SQLite persistent store:
1. `redmine_project_map`: `{ [redmine_proj_id]: vikunja_proj_id }`
2. `redmine_issue_map`:
   ```json
   {
     "123": {
       "vikunja_task_id": 456,
       "last_updated_on": "2026-09-30T10:00:00Z",
       "synced_at": "2026-09-30T10:05:00Z"
     }
   }
   ```
- Before syncing an issue:
  - If `issue.id` exists in map and `issue.updated_on == map[issue.id].last_updated_on`: skip update (no change).
  - If `issue.id` exists but `updated_on` is newer: update existing Vikunja task.
  - If `issue.id` does not exist: create new Vikunja task and store mapping.

---

## 5. Dynamic MCP Tools Specification (`redmine_mcp.js`)

Each tool is exposed with JSDoc directives:
1. **`redmine_get_issue`**:
   - Parameters: `issue_id` (number, required)
   - Returns: Issue detail, subject, description, journals, attachments with links.
2. **`redmine_update_issue`**:
   - Parameters:
     - `issue_id` (number, required)
     - `notes` (string, optional - AI summary of work done)
     - `status_id` (number, optional - target Redmine status ID)
     - `done_ratio` (number, optional - 0 to 100)
   - Guardrails: Validates parameter types and bounds, logs update audit trail to console.
3. **`redmine_sync_now`**:
   - Parameters: `dry_run` (boolean, optional, default: false)
   - Triggers the 1-way sync immediately and returns sync metrics (created, updated, skipped).

---

## 6. Configuration & Environment Variables

Workspace `.env`:
```env
# Redmine Config
REDMINE_URL=https://redmine.example.com
REDMINE_API_KEY=your_redmine_api_key_here
REDMINE_QUERY_ID=42

# Vikunja Config
VIKUNJA_URL=https://vikunja.example.com
VIKUNJA_API_TOKEN=your_vikunja_api_token_here

# Optional Tuning
SYNC_LIMIT=50
LOG_LEVEL=info
```
