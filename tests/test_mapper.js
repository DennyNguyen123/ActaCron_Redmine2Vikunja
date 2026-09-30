const assert = require("assert");
const mapper = require("../modules/mapper");

console.log("Testing modules/mapper.js...");

const mockIssue = {
  id: 105,
  subject: "Fix login button styling",
  description: "The login button is misaligned on mobile screens.",
  status: { id: 2, name: "In Progress", is_closed: false },
  priority: { id: 4, name: "Urgent" },
  author: { id: 1, name: "Admin User" },
  assigned_to: { id: 5, name: "Dev Jane" },
  start_date: "2026-10-01",
  due_date: "2026-10-05",
  done_ratio: 50,
  attachments: [
    {
      id: 201,
      filename: "screenshot.png",
      filesize: 1048576,
      description: "Bug screenshot"
    }
  ]
};

// 1. Title
const title = mapper.formatTitle(mockIssue);
assert.strictEqual(title, "[#105] Fix login button styling");
assert.strictEqual(mapper.formatTitle({ id: 42 }), "[#42] (No Subject)");
assert.strictEqual(mapper.formatTitle(null), "");
assert.strictEqual(mapper.formatTitle({}), "");

// 2. Priority
assert.strictEqual(mapper.mapPriority({ id: 1 }), 1); // Low
assert.strictEqual(mapper.mapPriority({ id: 2 }), 2); // Normal
assert.strictEqual(mapper.mapPriority({ id: 3 }), 3); // High
assert.strictEqual(mapper.mapPriority({ id: 4 }), 4); // Urgent
assert.strictEqual(mapper.mapPriority({ id: 5 }), 5); // Immediate
assert.strictEqual(mapper.mapPriority(null), 2); // Default to Normal
assert.strictEqual(mapper.mapPriority(1), 1);
assert.strictEqual(mapper.mapPriority(2), 2);
assert.strictEqual(mapper.mapPriority(3), 3);
assert.strictEqual(mapper.mapPriority(4), 4);
assert.strictEqual(mapper.mapPriority(5), 5);
assert.strictEqual(mapper.mapPriority(999), 2); // Unknown maps to Normal (2)

// 3. Status
assert.strictEqual(mapper.isIssueClosed(mockIssue), false);
assert.strictEqual(mapper.isIssueClosed({ status: { id: 5, is_closed: true } }), true);
assert.strictEqual(mapper.isIssueClosed({ status: { name: "Closed" } }), true);
assert.strictEqual(mapper.isIssueClosed({ status: { name: "resolved" } }), true);
assert.strictEqual(mapper.isIssueClosed({ status: { name: "Rejected" } }), true);
assert.strictEqual(mapper.isIssueClosed({ status: { name: "Open" } }), false);
assert.strictEqual(mapper.isIssueClosed(null), false);
assert.strictEqual(mapper.isIssueClosed({}), false);

// 4. Description & Attachments link
const desc = mapper.formatDescription(mockIssue, "https://redmine.example.com");
assert.ok(desc.includes("[Issue #105](https://redmine.example.com/issues/105)"));
assert.ok(desc.includes("The login button is misaligned on mobile screens."));
assert.ok(desc.includes("screenshot.png"));
assert.ok(desc.includes("https://redmine.example.com/attachments/download/201/screenshot.png"));
assert.ok(desc.includes("(1 MB)"));
assert.ok(desc.includes("Bug screenshot"));
assert.ok(desc.includes("> **Status:** In Progress | **Priority:** Urgent | **Done:** 50%"));
assert.ok(desc.includes("> **Assignee:** Dev Jane"));
assert.ok(desc.includes("> **Author:** Admin User"));
assert.ok(!desc.includes("undefined"));

// 5. Edge cases: missing description or attachments
const minimalIssue = {
  id: 200,
  subject: "Empty task"
};
const minimalDesc = mapper.formatDescription(minimalIssue, "https://redmine.example.com");
assert.ok(minimalDesc.includes("[Issue #200](https://redmine.example.com/issues/200)"));
assert.ok(minimalDesc.includes("*(No description provided in Redmine)*"));
assert.ok(!minimalDesc.includes("### Attachments"));
assert.ok(!minimalDesc.includes("undefined"));
assert.strictEqual(mapper.formatDescription(null), "");

// 6. Redmine URL trailing slash normalization
const descTrailingSlash = mapper.formatDescription(mockIssue, "https://redmine.example.com/");
assert.ok(descTrailingSlash.includes("https://redmine.example.com/issues/105"));
assert.ok(!descTrailingSlash.includes("redmine.example.com//"));

console.log("All mapper tests passed!");
