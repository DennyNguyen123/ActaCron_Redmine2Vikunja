/**
 * @name cross_caller
 * @cron 0/30 * * * *
 * @mcp true
 * @description Demonstrates multi-script orchestration using call() to invoke other functions across packages.
 * @param {string} user - Name of the user to process
 */
function main(params) {
  const userName = (params && params.user) || "Admin";
  console.log("Orchestrator cross_caller initiated for:", userName);

  // Invoke hello_cron function (supports 'package/func' or just 'func')
  const greeting = call("hello_cron", { name: userName });
  console.log("Sub-function result received:", JSON.stringify(greeting));

  return {
    status: "success",
    sub_task_output: greeting,
    orchestrated_at: new Date().toISOString()
  };
}
