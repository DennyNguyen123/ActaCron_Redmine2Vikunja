/**
 * @name sample_shared_job
 * @cron 0 8 * * *
 * @timeout 45
 * @mcp false
 * @description Demonstrates utilizing ActaCron shared utilities and persistent storage.
 */
function main(params) {
  // Use shared datetime helper
  const now = (typeof shared !== "undefined" && shared.datetime)
    ? shared.datetime.nowISO()
    : new Date().toISOString();

  // Use persistent key-value storage
  const lastRun = (typeof storage !== "undefined") ? storage.get("last_run") : null;
  if (typeof storage !== "undefined") {
    storage.set("last_run", now);
  }

  console.log("sample_shared_job running. Previous run was:", lastRun);

  return {
    status: "success",
    current_run: now,
    previous_run: lastRun
  };
}
