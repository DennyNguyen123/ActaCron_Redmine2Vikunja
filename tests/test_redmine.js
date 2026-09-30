const assert = require("assert");

console.log("Testing modules/redmine.js...");

// Backup any existing global.http
const originalHttp = global.http;

try {
  let lastCall = null;

  // Set up mock HTTP client
  global.http = {
    get: function(url, headers) {
      assert.strictEqual(headers["X-Redmine-API-Key"], "test_redmine_key");
      lastCall = { method: "GET", url: url, headers: headers };

      if (url.includes("/issues.json?query_id=12")) {
        return {
          status: 200,
          body: JSON.stringify({
            issues: [
              { id: 101, subject: "Test Query Issue", status: { id: 1, name: "New" } }
            ],
            total_count: 1
          })
        };
      }

      if (url.includes("/issues/101.json")) {
        return {
          status: 200,
          body: JSON.stringify({
            issue: { id: 101, subject: "Detail Issue", description: "Body of issue 101" }
          })
        };
      }

      return { status: 404, body: "{}" };
    },
    put: function(url, body, headers) {
      assert.strictEqual(headers["X-Redmine-API-Key"], "test_redmine_key");
      lastCall = { method: "PUT", url: url, body: body, headers: headers };

      if (url.includes("/issues/101.json")) {
        return {
          status: 200,
          body: JSON.stringify({
            issue: { id: 101, notes: body.issue ? body.issue.notes : undefined, status_id: body.issue ? body.issue.status_id : undefined }
          })
        };
      }

      return { status: 200, body: JSON.stringify({ issue: body.issue || {} }) };
    }
  };

  const redmine = require("../modules/redmine");
  const config = { url: "https://redmine.test", apiKey: "test_redmine_key" };

  // 1. Get issues by query with options
  const resQuery = redmine.getIssuesByQuery(config, { queryId: 12, limit: 10, offset: 0 });
  assert.strictEqual(lastCall.method, "GET");
  assert.strictEqual(
    lastCall.url,
    "https://redmine.test/issues.json?query_id=12&limit=10&offset=0&include=attachments"
  );
  assert.strictEqual(resQuery.issues.length, 1);
  assert.strictEqual(resQuery.issues[0].id, 101);
  assert.strictEqual(resQuery.total_count, 1);

  // 1b. Get issues by query defaults (limit 50, offset 0)
  redmine.getIssuesByQuery(config, { queryId: 12 });
  assert.strictEqual(
    lastCall.url,
    "https://redmine.test/issues.json?query_id=12&limit=50&offset=0&include=attachments"
  );

  // 1c. Missing queryId throws error
  assert.throws(() => {
    redmine.getIssuesByQuery(config, {});
  }, /Redmine queryId is required/);

  // 2. Get single issue with default include
  const resDetail = redmine.getIssue(config, 101);
  assert.strictEqual(lastCall.method, "GET");
  assert.strictEqual(
    lastCall.url,
    "https://redmine.test/issues/101.json?include=attachments%2Cjournals%2Crelations"
  );
  assert.strictEqual(resDetail.issue.id, 101);
  assert.strictEqual(resDetail.issue.description, "Body of issue 101");

  // 2b. Get single issue with custom include array
  redmine.getIssue(config, 101, { include: ["attachments"] });
  assert.strictEqual(
    lastCall.url,
    "https://redmine.test/issues/101.json?include=attachments"
  );

  // 2c. Missing issueId throws error
  assert.throws(() => {
    redmine.getIssue(config, null);
  }, /Redmine issueId is required/);

  // 3. Update issue
  const updateFields = { notes: "AI Agent finished task", status_id: 3 };
  const resUpdate = redmine.updateIssue(config, 101, updateFields);
  assert.strictEqual(lastCall.method, "PUT");
  assert.strictEqual(lastCall.url, "https://redmine.test/issues/101.json");
  assert.deepStrictEqual(lastCall.body, { issue: updateFields });
  assert.strictEqual(resUpdate.issue.notes, "AI Agent finished task");
  assert.strictEqual(resUpdate.issue.status_id, 3);

  // 3b. Missing issueId throws error
  assert.throws(() => {
    redmine.updateIssue(config, null, updateFields);
  }, /Redmine issueId is required/);

  // 4. URL trailing slash normalization
  const configWithSlash = { url: "https://redmine.test///", apiKey: "test_redmine_key" };
  redmine.getIssue(configWithSlash, 101);
  assert.strictEqual(
    lastCall.url,
    "https://redmine.test/issues/101.json?include=attachments%2Cjournals%2Crelations"
  );

  console.log("All redmine client tests passed!");
} finally {
  if (originalHttp !== undefined) {
    global.http = originalHttp;
  } else {
    delete global.http;
  }
}
