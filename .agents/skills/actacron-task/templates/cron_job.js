/**
 * @name sample_cron_job
 * @cron 0/15 * * * *
 * @timeout 30
 * @mcp false
 * @description Standard recurring task running every 15 minutes.
 */
function main(params) {
  const now = (typeof shared !== "undefined" && shared.datetime)
    ? shared.datetime.nowISO()
    : new Date().toISOString();

  console.log("Cron heartbeat at:", now);
  return { status: "active", run_at: now };
}
