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
