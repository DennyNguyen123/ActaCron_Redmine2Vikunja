/**
 * @name hello_cron
 * @cron 0/5 * * * *
 * @mcp true
 * @description Periodic greeting task running every 5 minutes and exported as an MCP Tool for AI agents.
 * @param {string} name - Name of recipient to greet (optional)
 */
function main(params) {
  const recipient = (params && params.name) || "World";
  console.log("hello_cron executed at:", new Date().toISOString(), "for:", recipient);

  return {
    status: "success",
    message: "Hello " + recipient + " from ActaCron!",
    timestamp: new Date().toISOString(),
    engine: "ActaCron Dynamic Runner"
  };
}
