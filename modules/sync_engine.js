/**
 * Core synchronization pipeline between Redmine and Vikunja.
 * 100% Stateless: Vikunja API is the single source of truth (zero SQLite DB dependency).
 */
var redmineClient = require("./redmine");
var vikunjaClient = require("./vikunja");
var mapper = require("./mapper");

function runSync(options) {
  options = options || {};
  var redmineConfig = options.redmine || {};
  var vikunjaConfig = options.vikunja || {};
  var dryRun = options.dryRun === true;
  var force = options.force === true || options.forceUpdate === true;

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

  // In-memory cache of Vikunja project tasks for the current execution run
  var projectTasksCache = {};

  for (var i = 0; i < issues.length; i++) {
    var issue = issues[i];
    var issueId = Number(issue.id);
    var redmineProj = issue.project || { id: 0, name: "Default" };

    // Resolve Vikunja Project ID directly from Vikunja
    var vikunjaProjectId = 0;
    if (!dryRun) {
      vikunjaProjectId = vikunjaClient.ensureProject(vikunjaConfig, {
        redmineProjectId: redmineProj.id,
        projectName: redmineProj.name
      });
    } else {
      var existingProjects = vikunjaClient.getAllProjects(vikunjaConfig);
      for (var p = 0; p < existingProjects.length; p++) {
        if (existingProjects[p].title && existingProjects[p].title.toLowerCase() === redmineProj.name.toLowerCase()) {
          vikunjaProjectId = existingProjects[p].id;
          break;
        }
      }
    }

    // Lazily fetch and index existing remote Vikunja tasks for this project
    if (vikunjaProjectId && !projectTasksCache[vikunjaProjectId]) {
      var remoteTasks = vikunjaClient.getAllProjectTasks(vikunjaConfig, vikunjaProjectId);
      var taskMap = {};
      for (var t = 0; t < remoteTasks.length; t++) {
        var rTask = remoteTasks[t];
        if (!rTask || !rTask.title) continue;
        var rIssueId = mapper.extractIssueId(rTask.title);
        if (rIssueId !== null && !taskMap[rIssueId]) {
          taskMap[rIssueId] = rTask;
        }
      }
      projectTasksCache[vikunjaProjectId] = taskMap;
    }

    var existingTask = (vikunjaProjectId && projectTasksCache[vikunjaProjectId])
      ? projectTasksCache[vikunjaProjectId][issueId]
      : null;

    var taskPayload = {
      title: mapper.formatTitle(issue),
      description: mapper.formatDescription(issue, redmineConfig.url),
      priority: mapper.mapPriority(issue.priority),
      done: mapper.isIssueClosed(issue),
      due_date: issue.due_date ? issue.due_date + "T23:59:59Z" : null
    };

    if (issue.start_date) {
      taskPayload.start_date = issue.start_date + "T00:00:00Z";
    }

    if (dryRun) {
      result.synced_issues.push({
        issue_id: issue.id,
        action: existingTask ? "would_update" : "would_create"
      });
      if (existingTask) {
        result.updated++;
      } else {
        result.created++;
      }
      continue;
    }

    if (existingTask && existingTask.id) {
      // Check if update is needed by comparing fields against Vikunja
      var needsUpdate = force;
      if (!needsUpdate) {
        if (existingTask.title !== taskPayload.title ||
            existingTask.done !== taskPayload.done ||
            existingTask.priority !== taskPayload.priority) {
          needsUpdate = true;
        }
        if (!needsUpdate) {
          var rDue = existingTask.due_date ? String(existingTask.due_date).substring(0, 10) : "";
          var expectedDue = taskPayload.due_date ? String(taskPayload.due_date).substring(0, 10) : "";
          if (rDue !== expectedDue) {
            needsUpdate = true;
          }
        }
      }

      if (!needsUpdate) {
        result.skipped++;
        continue;
      }

      try {
        vikunjaClient.updateTask(vikunjaConfig, existingTask.id, taskPayload);
        existingTask.title = taskPayload.title;
        existingTask.done = taskPayload.done;
        existingTask.priority = taskPayload.priority;
        existingTask.due_date = taskPayload.due_date;
        result.updated++;
        result.synced_issues.push({
          issue_id: issue.id,
          action: "updated",
          task_id: existingTask.id
        });
      } catch (updateErr) {
        // Self-healing: if task was deleted on Vikunja (404), re-create it!
        if (updateErr && (updateErr.status === 404 || String(updateErr).indexOf("404") !== -1)) {
          var recreatedTask = vikunjaClient.createTask(vikunjaConfig, vikunjaProjectId, taskPayload);
          projectTasksCache[vikunjaProjectId][issueId] = recreatedTask;
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
      // Create new task on Vikunja
      var createdTask = vikunjaClient.createTask(vikunjaConfig, vikunjaProjectId, taskPayload);
      if (vikunjaProjectId && projectTasksCache[vikunjaProjectId]) {
        projectTasksCache[vikunjaProjectId][issueId] = createdTask;
      }
      result.created++;
      result.synced_issues.push({
        issue_id: issue.id,
        action: "created",
        task_id: createdTask.id
      });
    }
  }

  return result;
}

module.exports = {
  runSync: runSync
};
