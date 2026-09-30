/**
 * @name sample_mcp_tool
 * @timeout 30
 * @mcp true
 * @description AI Agent tool exported for Claude Desktop and Cursor IDE.
 * @param {string} query - Search or query parameter
 * @param {number} limit - Maximum number of results to return
 */
function main(params) {
  const query = (params && params.query) || "";
  const limit = (params && params.limit) || 10;

  console.log("MCP Tool called with query:", query, "limit:", limit);

  return {
    query: query,
    results: [],
    count: 0
  };
}
