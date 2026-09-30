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
    if (url.includes("/api/v1/projects")) {
      return { status: 200, body: JSON.stringify([]) };
    }
    return { status: 404, body: "{}" };
  },
  put: function(url, body) {
    if (url.includes("/issues/100.json")) {
      return { status: 200, body: JSON.stringify({ issue: { id: 100, status_id: body.issue.status_id } }) };
    }
    return { status: 200, body: "{}" };
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

// 4. Sync now
const syncRes = redmineMcp({ action: "sync_now", dry_run: true });
assert.strictEqual(syncRes.status, "ok");
assert.strictEqual(syncRes.action, "sync_now");

console.log("All MCP tests passed!");
