#!/usr/bin/env node
/**
 * Zero-dependency ActaCron Script & JSDoc Validator.
 * Run via `node scripts/validate.js` or `npm test`.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
let hasErrors = false;

console.log("Scanning directory for ActaCron scripts & configs:", rootDir);

// Check 0: Validate workspace.json if present
const wsJsonPath = path.join(rootDir, "workspace.json");
if (fs.existsSync(wsJsonPath)) {
  console.log("\nValidating [workspace.json]...");
  try {
    const wsContent = fs.readFileSync(wsJsonPath, "utf-8");
    const wsConfig = JSON.parse(wsContent);
    if (wsConfig.timeout_seconds !== undefined) {
      if (typeof wsConfig.timeout_seconds !== "number" || wsConfig.timeout_seconds <= 0 || !Number.isInteger(wsConfig.timeout_seconds)) {
        console.error("  [FAIL] 'timeout_seconds' in workspace.json must be a positive integer!");
        hasErrors = true;
      } else {
        console.log(`  [PASS] workspace timeout: ${wsConfig.timeout_seconds}s`);
      }
    }
    console.log("  [PASS] workspace.json syntax is valid.");
  } catch (err) {
    console.error(`  [FAIL] workspace.json is invalid JSON: ${err.message}`);
    hasErrors = true;
  }
}

const files = fs.readdirSync(rootDir).filter(f => f.endsWith(".js"));

if (files.length === 0) {
  console.log("No .js scripts found in root directory.");
  process.exit(hasErrors ? 1 : 0);
}

files.forEach(file => {
  const filePath = path.join(rootDir, file);
  const content = fs.readFileSync(filePath, "utf-8");
  console.log(`\nValidating [${file}]...`);

  // Check 1: Comment termination trap: '*/' inside @cron or JSDoc lines
  // E.g. '@cron */15 * * * *' prematurely ends the JSDoc comment block and breaks JS syntax
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/@cron\s+[^\r\n]*\*\//.test(line)) {
      console.error(`  [FAIL] Detected premature '*/' in @cron directive (line ${i + 1})! Replace '*/' with '0/' or comma-separated values.`);
      hasErrors = true;
      break;
    }
  }

  // Check 2: JSDoc annotations
  if (!/@name\s+[\w-]+/.test(content)) {
    console.warn(`  [WARN] Missing @name directive in JSDoc header.`);
  }

  // Check 2b: Validate @timeout directive if present (must be strictly a positive integer)
  const timeoutMatch = content.match(/@timeout\s+([^\r\n]+)/);
  if (timeoutMatch) {
    const rawTimeout = timeoutMatch[1].trim();
    if (!/^\d+$/.test(rawTimeout) || parseInt(rawTimeout, 10) <= 0) {
      console.error(`  [FAIL] Invalid @timeout value '${rawTimeout}'. Must be a positive integer.`);
      hasErrors = true;
    } else {
      console.log(`  [INFO] Custom timeout specified: ${rawTimeout}s`);
    }
  }

  // Check 2c: Validate @allowExec directive if present
  const allowExecMatch = content.match(/@allowExec\s+([^\r\n]+)/);
  if (allowExecMatch) {
    const val = allowExecMatch[1].trim();
    if (val !== "true" && val !== "false") {
      console.error(`  [FAIL] Invalid @allowExec value '${val}'. Must be true or false.`);
      hasErrors = true;
    }
  }

  // Check 3: Entry point main function
  if (!/function\s+main\s*\(/.test(content)) {
    console.error(`  [FAIL] Missing 'function main(params)' entry point!`);
    hasErrors = true;
  }

  // Check 4: JavaScript AST syntax validity
  try {
    new vm.Script(content, { filename: file });
    console.log(`  [PASS] JavaScript syntax is valid.`);
  } catch (err) {
    console.error(`  [FAIL] Syntax Error in ${file}: ${err.message}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error("\nValidation failed with errors!");
  process.exit(1);
} else {
  console.log("\nAll ActaCron scripts validated successfully!");
  process.exit(0);
}
