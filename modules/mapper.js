/**
 * Data transformation rules between Redmine issues and Vikunja tasks.
 * Compatible with Goja / ES5.1+ runtimes.
 */

function formatTitle(issue) {
  if (!issue || !issue.id) {
    return "";
  }
  var subject = issue.subject || "(No Subject)";
  return "[#" + issue.id + "] " + subject;
}

function mapPriority(priority) {
  if (!priority) {
    return 2; // Default to Normal
  }
  var id = (typeof priority === "object" && priority !== null) ? priority.id : priority;
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
  if (!issue || !issue.status) {
    return false;
  }
  var status = issue.status;
  if (status.is_closed === true) {
    return true;
  }
  var name = (status.name || "").toLowerCase();
  return name === "closed" || name === "resolved" || name === "rejected";
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }
  var k = 1024;
  var sizes = ["B", "KB", "MB", "GB", "TB"];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i >= sizes.length) {
    i = sizes.length - 1;
  }
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDescription(issue, redmineUrl) {
  if (!issue || !issue.id) {
    return "";
  }
  var base = (redmineUrl || "").replace(/\/+$/, "");
  var lines = [];

  // Redmine Reference Header
  var issueUrl = base ? base + "/issues/" + issue.id : "#" + issue.id;
  lines.push("**Redmine Link:** [Issue #" + issue.id + "](" + issueUrl + ")");
  lines.push("");

  // Metadata block
  var statusName = (issue.status && issue.status.name) ? issue.status.name : "N/A";
  var priorityName = (issue.priority && issue.priority.name) ? issue.priority.name : "N/A";
  var metaParts = [
    "**Status:** " + statusName,
    "**Priority:** " + priorityName
  ];
  if (issue.done_ratio !== undefined && issue.done_ratio !== null) {
    metaParts.push("**Done:** " + issue.done_ratio + "%");
  }
  lines.push("> " + metaParts.join(" | "));

  if (issue.assigned_to && issue.assigned_to.name) {
    lines.push("> **Assignee:** " + issue.assigned_to.name);
  }
  if (issue.author && issue.author.name) {
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
      if (!att) continue;
      var filename = att.filename || "attachment";
      var downloadUrl = base ? base + "/attachments/download/" + att.id + "/" + encodeURIComponent(filename) : "#";
      var sizeStr = att.filesize ? " (" + formatBytes(att.filesize) + ")" : "";
      var note = att.description ? " - *" + att.description + "*" : "";
      lines.push("- [" + filename + "](" + downloadUrl + ")" + sizeStr + note);
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
