const assert = require("assert");

console.log("Testing modules/http.js...");

// Backup any existing global.http
const originalHttp = global.http;

try {
  // Test 1: Global http not defined throws error
  delete global.http;
  delete globalThis.http;
  const httpModule = require("../modules/http");
  assert.throws(() => {
    httpModule.get("https://api.example.com/test");
  }, /HTTP client not available/);

  // Set up mock HTTP client
  let lastCall = null;
  const mockHttp = {
    get: function(url, headers) {
      lastCall = { method: "GET", url: url, headers: headers };
      return {
        status: 200,
        body: JSON.stringify({ message: "get ok", id: 1 })
      };
    },
    post: function(url, body, headers) {
      lastCall = { method: "POST", url: url, body: body, headers: headers };
      return {
        status: 201,
        body: JSON.stringify({ message: "created", id: 2 })
      };
    },
    put: function(url, body, headers) {
      lastCall = { method: "PUT", url: url, body: body, headers: headers };
      return {
        status: 200,
        body: JSON.stringify({ message: "updated", id: 3 })
      };
    },
    delete: function(url, headers) {
      lastCall = { method: "DELETE", url: url, headers: headers };
      return {
        status: 200,
        body: JSON.stringify({ message: "deleted" })
      };
    }
  };

  global.http = mockHttp;

  // Test 2: GET request with default headers
  const getRes = httpModule.get("https://api.example.com/items");
  assert.strictEqual(lastCall.method, "GET");
  assert.strictEqual(lastCall.url, "https://api.example.com/items");
  assert.strictEqual(lastCall.headers["Accept"], "application/json");
  assert.strictEqual(lastCall.headers["Content-Type"], "application/json");
  assert.strictEqual(getRes.status, 200);
  assert.deepStrictEqual(getRes.data, { message: "get ok", id: 1 });
  assert.strictEqual(getRes.rawBody, JSON.stringify({ message: "get ok", id: 1 }));

  // Test 3: GET with custom headers overriding and extending defaults
  httpModule.get("https://api.example.com/items/5", {
    "X-Custom-Header": "CustomValue",
    "Accept": "application/xml"
  });
  assert.strictEqual(lastCall.headers["X-Custom-Header"], "CustomValue");
  assert.strictEqual(lastCall.headers["Accept"], "application/xml");
  assert.strictEqual(lastCall.headers["Content-Type"], "application/json");

  // Test 4: POST request with body
  const postPayload = { title: "New Item", score: 99 };
  const postRes = httpModule.post("https://api.example.com/items", postPayload, {
    "Authorization": "Bearer token123"
  });
  assert.strictEqual(lastCall.method, "POST");
  assert.strictEqual(lastCall.url, "https://api.example.com/items");
  assert.deepStrictEqual(lastCall.body, postPayload);
  assert.strictEqual(lastCall.headers["Authorization"], "Bearer token123");
  assert.strictEqual(postRes.status, 201);
  assert.deepStrictEqual(postRes.data, { message: "created", id: 2 });

  // Test 5: PUT request when http.put is supported
  const putPayload = { title: "Updated Item" };
  const putRes = httpModule.put("https://api.example.com/items/2", putPayload);
  assert.strictEqual(lastCall.method, "PUT");
  assert.strictEqual(lastCall.url, "https://api.example.com/items/2");
  assert.deepStrictEqual(lastCall.body, putPayload);
  assert.strictEqual(putRes.status, 200);
  assert.deepStrictEqual(putRes.data, { message: "updated", id: 3 });

  // Test 6: PUT fallback to http.post when http.put is NOT defined
  delete mockHttp.put;
  const putFallbackRes = httpModule.put("https://api.example.com/items/2", putPayload);
  assert.strictEqual(lastCall.method, "POST");
  assert.strictEqual(lastCall.url, "https://api.example.com/items/2");
  assert.deepStrictEqual(lastCall.body, putPayload);
  assert.strictEqual(lastCall.headers["X-HTTP-Method-Override"], "PUT");
  assert.strictEqual(putFallbackRes.status, 201);

  // Restore put function
  mockHttp.put = function(url, body, headers) {
    lastCall = { method: "PUT", url: url, body: body, headers: headers };
    return { status: 200, body: JSON.stringify({ message: "updated" }) };
  };

  // Test 7: DELETE request when http.delete is supported
  const delRes1 = httpModule["delete"]("https://api.example.com/items/3");
  assert.strictEqual(lastCall.method, "DELETE");
  assert.strictEqual(lastCall.url, "https://api.example.com/items/3");
  assert.strictEqual(delRes1.status, 200);

  // Test 8: del alias for DELETE
  const delRes2 = httpModule.del("https://api.example.com/items/4");
  assert.strictEqual(lastCall.method, "DELETE");
  assert.strictEqual(lastCall.url, "https://api.example.com/items/4");
  assert.strictEqual(delRes2.status, 200);

  // Test 9: DELETE throws error when unsupported by runtime
  delete mockHttp.delete;
  delete mockHttp.del;
  assert.throws(() => {
    httpModule["delete"]("https://api.example.com/items/5");
  }, /HTTP DELETE is not supported by current runtime/);

  // Restore delete function
  mockHttp.delete = function(url, headers) {
    lastCall = { method: "DELETE", url: url, headers: headers };
    return { status: 200, body: "{}" };
  };

  // Test 10: Non-JSON body is retained as string
  mockHttp.get = function() {
    return { status: 200, body: "Plain text response or HTML <html></html>" };
  };
  const textRes = httpModule.get("https://api.example.com/text");
  assert.strictEqual(textRes.status, 200);
  assert.strictEqual(textRes.data, "Plain text response or HTML <html></html>");
  assert.strictEqual(textRes.rawBody, "Plain text response or HTML <html></html>");

  // Test 11: Error handling: 400 Bad Request with JSON error message
  mockHttp.get = function() {
    return {
      status: 400,
      body: JSON.stringify({ message: "Invalid query parameter" })
    };
  };
  assert.throws(() => {
    httpModule.get("https://api.example.com/bad");
  }, function(err) {
    return err.status === 400 && err.message.includes("400") && err.message.includes("Invalid query parameter");
  });

  // Test 12: Error handling: 404 Not Found with raw string
  mockHttp.get = function() {
    return {
      status: 404,
      body: "Page Not Found"
    };
  };
  assert.throws(() => {
    httpModule.get("https://api.example.com/missing");
  }, function(err) {
    return err.status === 404 && err.message.includes("404") && err.message.includes("Page Not Found");
  });

  // Test 13: Error handling: 500 Internal Server Error
  mockHttp.get = function() {
    return {
      status: 500,
      body: "Internal Server Error"
    };
  };
  assert.throws(() => {
    httpModule.get("https://api.example.com/error");
  }, function(err) {
    return err.status === 500 && err.message.includes("500");
  });

  // Test 14: Direct request() invocation with lowercase method and options.data
  mockHttp.post = function(url, body, headers) {
    lastCall = { method: "POST", url: url, body: body, headers: headers };
    return { status: 200, body: JSON.stringify({ ok: true }) };
  };
  const reqRes = httpModule.request("post", "https://api.example.com/data", {
    data: { test: 123 },
    headers: { "X-Test": "1" }
  });
  assert.strictEqual(lastCall.method, "POST");
  assert.deepStrictEqual(lastCall.body, { test: 123 });
  assert.strictEqual(reqRes.status, 200);
  assert.deepStrictEqual(reqRes.data, { ok: true });

  console.log("All HTTP tests passed!");
} finally {
  if (originalHttp !== undefined) {
    global.http = originalHttp;
  } else {
    delete global.http;
  }
}
