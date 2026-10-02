/**
 * Vikunja REST API client module with project auto-provisioning.
 * Compatible with Goja / ES5.1+ runtimes.
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

function getProjects(config, options) {
  options = options || {};
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/projects";
  var queryParts = [];
  if (options.page) queryParts.push("page=" + encodeURIComponent(options.page));
  if (options.per_page) queryParts.push("per_page=" + encodeURIComponent(options.per_page));
  if (options.s) queryParts.push("s=" + encodeURIComponent(options.s));
  if (queryParts.length > 0) {
    endpoint += "?" + queryParts.join("&");
  }
  var res = httpClient.get(endpoint, getHeaders(config.token));
  return Array.isArray(res.data) ? res.data : [];
}

function getAllProjects(config) {
  var perPage = 50;
  var page = 1;
  var all = [];
  while (true) {
    var batch = getProjects(config, { page: page, per_page: perPage });
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (var i = 0; i < batch.length; i++) {
      all.push(batch[i]);
    }
    if (batch.length < perPage) break;
    page++;
  }
  return all;
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

  // 2. Fetch existing Vikunja projects to check for title match (case-insensitive)
  var projects = getAllProjects(config);
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
    description: options.description || ("Synchronized from Redmine Project #" + redmineProjectId)
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

function getProjectTasks(config, projectId, options) {
  options = options || {};
  var baseUrl = cleanUrl(config.url);
  var endpoint = baseUrl + "/api/v1/projects/" + encodeURIComponent(projectId) + "/tasks";
  var queryParts = [];
  if (options.page) queryParts.push("page=" + encodeURIComponent(options.page));
  if (options.per_page) queryParts.push("per_page=" + encodeURIComponent(options.per_page));
  if (options.s) queryParts.push("s=" + encodeURIComponent(options.s));
  if (queryParts.length > 0) {
    endpoint += "?" + queryParts.join("&");
  }
  var res = httpClient.get(endpoint, getHeaders(config.token));
  return Array.isArray(res.data) ? res.data : [];
}

function getAllProjectTasks(config, projectId, options) {
  options = options || {};
  var perPage = options.per_page || 50;
  var page = 1;
  var allTasks = [];
  while (true) {
    var tasks = getProjectTasks(config, projectId, { page: page, per_page: perPage, s: options.s });
    if (!Array.isArray(tasks) || tasks.length === 0) {
      break;
    }
    for (var i = 0; i < tasks.length; i++) {
      allTasks.push(tasks[i]);
    }
    if (tasks.length < perPage) {
      break;
    }
    page++;
  }
  return allTasks;
}

module.exports = {
  getProjects: getProjects,
  getAllProjects: getAllProjects,
  createProject: createProject,
  ensureProject: ensureProject,
  createTask: createTask,
  updateTask: updateTask,
  getProjectTasks: getProjectTasks,
  getAllProjectTasks: getAllProjectTasks
};
