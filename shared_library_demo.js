/**
 * @name shared_library_demo
 * @cron 0 9 * * 1-5
 * @timeout 45
 * @mcp true
 * @description Demonstrates ActaCron shared library (shared.*), safe require('_shared/...'), and persistent storage.
 * @param {string} taskName - Name of the demo task to record (optional)
 */
function main(params) {
  const task = (params && params.taskName) || "Daily Routine";

  // 1. Shared Datetime Helpers
  const timestamp = (typeof shared !== "undefined" && shared.datetime)
    ? shared.datetime.nowISO()
    : new Date().toISOString();

  // 2. Shared Utilities (UUID, Safe JSON)
  const executionId = (typeof shared !== "undefined" && shared.utils)
    ? shared.utils.uuid()
    : (typeof crypto !== "undefined" ? crypto.uuid() : "manual-" + Date.now());

  // 3. Persistent Package Storage
  let runCount = 0;
  if (typeof storage !== "undefined") {
    const prev = storage.get("run_count");
    runCount = (typeof prev === "number" ? prev : 0) + 1;
    storage.set("run_count", runCount);
    storage.set("last_execution_id", executionId);
  }

  // 4. Scoped Environment Variables
  const allEnvKeys = (typeof env !== "undefined" && typeof env.all === "function")
    ? Object.keys(env.all())
    : [];

  console.log("Executing", task, "| Run count:", runCount, "| ID:", executionId);

  return {
    status: "success",
    task: task,
    run_count: runCount,
    execution_id: executionId,
    timestamp: timestamp,
    available_env_count: allEnvKeys.length
  };
}
