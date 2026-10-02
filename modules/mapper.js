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

function extractIssueId(title) {
  if (!title || typeof title !== "string") {
    return null;
  }
  var match = title.match(/^\[#(\d+)\]/);
  return match ? Number(match[1]) : null;
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
  var name = (status.name || "").toLowerCase().trim();
  if (!name) {
    return false;
  }
  var closedKeywords = [
    "closed", "resolved", "rejected", "done", "completed", "finish", "finished",
    "đã giải quyết", "giải quyết", "đã đóng", "đóng", "hoàn thành", "hoàn tất", "từ chối", "kết thúc"
  ];
  for (var i = 0; i < closedKeywords.length; i++) {
    if (name.indexOf(closedKeywords[i]) !== -1) {
      return true;
    }
  }
  return false;
}

function mapPercentDone(issue) {
  if (!issue) {
    return 0;
  }
  if (isIssueClosed(issue)) {
    return 1.0;
  }
  if (issue.done_ratio !== undefined && issue.done_ratio !== null) {
    var ratio = Number(issue.done_ratio);
    if (!isNaN(ratio)) {
      return Math.max(0, Math.min(1.0, ratio / 100));
    }
  }
  return 0;
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

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDescription(issue, redmineUrl) {
  if (!issue || !issue.id) {
    return "";
  }
  var base = (redmineUrl || "").replace(/\/+$/, "");
  var html = [];

  // Redmine Reference Header
  var issueUrl = base ? base + "/issues/" + issue.id : "#";
  html.push("<p><strong>Redmine Link:</strong> <a href=\"" + issueUrl + "\" target=\"_blank\" rel=\"noopener noreferrer\">Issue #" + issue.id + "</a></p>");

  // Metadata blockquote
  var statusName = (issue.status && issue.status.name) ? escapeHtml(issue.status.name) : "N/A";
  var priorityName = (issue.priority && issue.priority.name) ? escapeHtml(issue.priority.name) : "N/A";
  var metaParts = [
    "<strong>Status:</strong> " + statusName,
    "<strong>Priority:</strong> " + priorityName
  ];
  if (isIssueClosed(issue)) {
    metaParts.push("<strong>Done:</strong> 100%");
  } else if (issue.done_ratio !== undefined && issue.done_ratio !== null) {
    metaParts.push("<strong>Done:</strong> " + issue.done_ratio + "%");
  }

  var bqLines = ["<p>" + metaParts.join(" | ") + "</p>"];
  if (issue.assigned_to && issue.assigned_to.name) {
    bqLines.push("<p><strong>Assignee:</strong> " + escapeHtml(issue.assigned_to.name) + "</p>");
  }
  if (issue.author && issue.author.name) {
    bqLines.push("<p><strong>Author:</strong> " + escapeHtml(issue.author.name) + "</p>");
  }
  html.push("<blockquote>" + bqLines.join("") + "</blockquote>");

  // Main issue description
  html.push("<h3>Description</h3>");
  if (issue.description && issue.description.trim().length > 0) {
    var descBody = escapeHtml(issue.description.trim()).replace(/\r?\n/g, "<br>");
    html.push("<p>" + descBody + "</p>");
  } else {
    html.push("<p><em>(No description provided in Redmine)</em></p>");
  }

  // Attachments section (Links only, no binary download)
  if (issue.attachments && issue.attachments.length > 0) {
    html.push("<h3>Attachments</h3>");
    html.push("<ul>");
    for (var i = 0; i < issue.attachments.length; i++) {
      var att = issue.attachments[i];
      if (!att) continue;
      var filename = att.filename || "attachment";
      var downloadUrl = base ? base + "/attachments/download/" + att.id + "/" + encodeURIComponent(filename) : "#";
      var sizeStr = att.filesize ? " (" + formatBytes(att.filesize) + ")" : "";
      var note = att.description ? " - <em>" + escapeHtml(att.description) + "</em>" : "";
      html.push("<li><a href=\"" + downloadUrl + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(filename) + "</a>" + sizeStr + note + "</li>");
    }
    html.push("</ul>");
  }

  return html.join("\n");
}

module.exports = {
  formatTitle: formatTitle,
  extractIssueId: extractIssueId,
  mapPriority: mapPriority,
  isIssueClosed: isIssueClosed,
  mapPercentDone: mapPercentDone,
  formatDescription: formatDescription
};
