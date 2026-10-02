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
  var force = options.force === true || options.forceUpdate === true;
  var resetCache = options.resetCache === true || options.reset === true;

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

  var issues = (queryRes && queryRes.issues) ? queryRes.issues : [];
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

  if (resetCache) {
    if (storage && typeof storage.delete === "function") {
      storage.delete(issueMapKey);
      storage.delete("redmine_project_map");
    }
  } else if (storage && typeof storage.get === "function") {
    var stored = storage.get(issueMapKey);
    if (stored && typeof stored === "object") {
      issueMap = stored;
    }
  }

  var projectRemoteTaskCache = {};

  for (var i = 0; i < issues.length; i++) {
    var issue = issues[i];
    var issueId = String(issue.id);
    var redmineProj = issue.project || { id: 0, name: "Default" };
    var updatedOn = issue.updated_on || "";

    // Check if task exists and is up to date (unless force update is requested)
    var existingRecord = issueMap[issueId];
    if (!force && existingRecord && existingRecord.last_updated_on === updatedOn) {
      result.skipped++;
      continue;
    }

    // Ensure Vikunja Project ID is determined
    var vikunjaProjectId = 0;
    if (!dryRun) {
      vikunjaProjectId = vikunjaClient.ensureProject(vikunjaConfig, storage, {
        redmineProjectId: redmineProj.id,
        projectName: redmineProj.name
      });
    } else {
      var cacheKey = "redmine_project_map";
      var projMap = (storage && typeof storage.get === "function") ? storage.get(cacheKey) : null;
      if (projMap && projMap[redmineProj.id]) {
        vikunjaProjectId = projMap[redmineProj.id];
      } else {
        var existingProjects = vikunjaClient.getAllProjects(vikunjaConfig);
        for (var p = 0; p < existingProjects.length; p++) {
          if (existingProjects[p].title && existingProjects[p].title.toLowerCase() === redmineProj.name.toLowerCase()) {
            vikunjaProjectId = existingProjects[p].id;
            break;
          }
        }
      }
    }

    // Remote discovery: if task is not in local SQLite cache, scan Vikunja project tasks by title prefix [#id]
    if (!existingRecord && vikunjaProjectId) {
      if (!projectRemoteTaskCache[vikunjaProjectId]) {
        projectRemoteTaskCache[vikunjaProjectId] = true;
        var remoteTasks = vikunjaClient.getAllProjectTasks(vikunjaConfig, vikunjaProjectId);
        for (var tIdx = 0; tIdx < remoteTasks.length; tIdx++) {
          var rTask = remoteTasks[tIdx];
          if (!rTask || !rTask.title) continue;
          var remoteIssueId = mapper.extractIssueId(rTask.title);
          if (remoteIssueId !== null) {
            var strRemoteId = String(remoteIssueId);
            if (!issueMap[strRemoteId]) {
              issueMap[strRemoteId] = {
                vikunja_task_id: rTask.id,
                last_updated_on: null,
                synced_at: new Date().toISOString()
              };
            }
          }
        }
      }
      existingRecord = issueMap[issueId];
    }

    if (!force && existingRecord && existingRecord.last_updated_on === updatedOn) {
      result.skipped++;
      continue;
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
      result.synced_issues.push({
        issue_id: issue.id,
        action: existingRecord ? "would_update" : "would_create"
      });
      if (existingRecord) {
        result.updated++;
      } else {
        result.created++;
      }
      continue;
    }

    if (existingRecord && existingRecord.vikunja_task_id) {
      // Attempt to update existing task in Vikunja
      try {
        vikunjaClient.updateTask(vikunjaConfig, existingRecord.vikunja_task_id, taskPayload);
        existingRecord.last_updated_on = updatedOn;
        existingRecord.synced_at = new Date().toISOString();
        result.updated++;
        result.synced_issues.push({
          issue_id: issue.id,
          action: "updated",
          task_id: existingRecord.vikunja_task_id
        });
      } catch (updateErr) {
        // Self-healing: if task was deleted on Vikunja (404), re-create it!
        if (updateErr && (updateErr.status === 404 || String(updateErr).indexOf("404") !== -1)) {
          var recreatedTask = vikunjaClient.createTask(vikunjaConfig, vikunjaProjectId, taskPayload);
          existingRecord.vikunja_task_id = recreatedTask.id;
          existingRecord.last_updated_on = updatedOn;
          existingRecord.synced_at = new Date().toISOString();
          result.created++;
          result.synced_issues.push({
            issue_id: issue.id,
            action: "recreated",
            task_id: recreatedTask.id
          });
        } else {
          throw updateErr;
        }
      }
    } else {
      // Create new task in Vikunja
      var createdTask = vikunjaClient.createTask(vikunjaConfig, vikunjaProjectId, taskPayload);
      issueMap[issueId] = {
        vikunja_task_id: createdTask.id,
        last_updated_on: updatedOn,
        synced_at: new Date().toISOString()
      };
      result.created++;
      result.synced_issues.push({
        issue_id: issue.id,
        action: "created",
        task_id: createdTask.id
      });
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
