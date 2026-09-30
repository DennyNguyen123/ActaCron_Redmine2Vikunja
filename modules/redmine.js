/**
 * Redmine REST API client module.
 * Compatible with Goja / ES5.1+ runtimes.
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
  config = config || {};
  options = options || {};
  var baseUrl = cleanUrl(config.url);
  var queryId = options.queryId;
  var limit = options.limit !== undefined ? options.limit : 50;
  var offset = options.offset !== undefined ? options.offset : 0;

  if (queryId === undefined || queryId === null || queryId === "") {
    throw new Error("Redmine queryId is required to fetch issues");
  }

  var endpoint = baseUrl + "/issues.json?query_id=" + encodeURIComponent(queryId) +
    "&limit=" + encodeURIComponent(limit) +
    "&offset=" + encodeURIComponent(offset) +
    "&include=attachments";

  if (config.apiKey) {
    endpoint += "&key=" + encodeURIComponent(config.apiKey);
  }

  var res = httpClient.get(endpoint, getHeaders(config.apiKey));
  return res.data;
}

function getIssue(config, issueId, options) {
  config = config || {};
  options = options || {};
  if (issueId === undefined || issueId === null || issueId === "") {
    throw new Error("Redmine issueId is required");
  }

  var baseUrl = cleanUrl(config.url);
  var includeStr = "attachments,journals,relations";
  if (options.include) {
    if (Array.isArray(options.include)) {
      includeStr = options.include.join(",");
    } else {
      includeStr = String(options.include);
    }
  }

  var endpoint = baseUrl + "/issues/" + encodeURIComponent(issueId) + ".json?include=" + encodeURIComponent(includeStr);
  if (config.apiKey) {
    endpoint += "&key=" + encodeURIComponent(config.apiKey);
  }

  var res = httpClient.get(endpoint, getHeaders(config.apiKey));
  return res.data;
}

function updateIssue(config, issueId, fields) {
  config = config || {};
  if (issueId === undefined || issueId === null || issueId === "") {
    throw new Error("Redmine issueId is required");
  }

  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/issues/" + encodeURIComponent(issueId) + ".json";
  if (config.apiKey) {
    endpoint += "?key=" + encodeURIComponent(config.apiKey);
  }

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
