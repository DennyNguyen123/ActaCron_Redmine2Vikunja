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
