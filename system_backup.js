/**
 * @name system_backup
 * @cron 0 2 * * *
 * @timeout 60
 * @allowExec true
 * @mcp false
 * @description Executes shell/system utilities via exec() to create scheduled backups or health diagnostics.
 * @param {string} targetDir - Custom destination folder path (optional)
 */
function main(params) {
  // Read configured environment variable or fallback to parameter / default
  const backupRoot = (params && params.targetDir) || env("BACKUP_PATH") || "C:/Backups";
  console.log("Starting backup task with target root:", backupRoot);

  // Note: exec() requires "Allow Shell Commands" enabled in ActaCron Settings and @allowExec true
  const pingResult = exec("ping", ["-n", "1", "127.0.0.1"]);
  const stdoutLen = (pingResult && pingResult.stdout) ? pingResult.stdout.length : 0;
  console.log("Loopback ping executed. Exit code:", pingResult ? pingResult.exitCode : -1, "Output length:", stdoutLen);

  return {
    status: "completed",
    destination: backupRoot,
    exit_code: pingResult ? pingResult.exitCode : -1,
    executed_at: new Date().toISOString()
  };
}
