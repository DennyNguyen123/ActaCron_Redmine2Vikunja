/**
 * HTTP client abstraction module for ActaCron and Node.js runtimes.
 * Compatible with Goja / ES5.1+ runtimes.
 */

function getHttpClient() {
  if (typeof http !== "undefined") {
    return http;
  }
  if (typeof globalThis !== "undefined" && globalThis.http) {
    return globalThis.http;
  }
  if (typeof global !== "undefined" && global.http) {
    return global.http;
  }
  return null;
}

function mergeHeaders(customHeaders) {
  var headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  if (customHeaders && typeof customHeaders === "object") {
    for (var key in customHeaders) {
      if (Object.prototype.hasOwnProperty.call(customHeaders, key)) {
        headers[key] = customHeaders[key];
      }
    }
  }

  return headers;
}

function parseResponseBody(body) {
  if (body === undefined || body === null) {
    return { data: "", rawBody: "" };
  }

  if (typeof body === "object") {
    var raw = "";
    try {
      raw = JSON.stringify(body);
    } catch (e) {
      raw = "";
    }
    return { data: body, rawBody: raw };
  }

  var rawBody = String(body);
  var data = rawBody;

  if (rawBody.trim().length > 0) {
    try {
      data = JSON.parse(rawBody);
    } catch (e) {
      data = rawBody;
    }
  }

  return { data: data, rawBody: rawBody };
}

function request(method, url, options) {
  options = options || {};
  var m = (method || "GET").toUpperCase();
  var headers = mergeHeaders(options.headers);
  var body = options.body !== undefined ? options.body : options.data;

  var httpClient = getHttpClient();
  if (!httpClient) {
    throw new Error("HTTP client not available: global 'http' object is not defined");
  }

  var res;

  if (m === "GET") {
    if (typeof httpClient.get !== "function") {
      throw new Error("HTTP GET is not supported by current runtime");
    }
    res = httpClient.get(url, headers);
  } else if (m === "POST") {
    if (typeof httpClient.post !== "function") {
      throw new Error("HTTP POST is not supported by current runtime");
    }
    res = httpClient.post(url, body, headers);
  } else if (m === "PUT") {
    if (typeof httpClient.put === "function") {
      res = httpClient.put(url, body, headers);
    } else if (typeof httpClient.post === "function") {
      headers["X-HTTP-Method-Override"] = "PUT";
      res = httpClient.post(url, body, headers);
    } else {
      throw new Error("HTTP PUT is not supported by current runtime");
    }
  } else if (m === "DELETE") {
    if (typeof httpClient["delete"] === "function") {
      res = httpClient["delete"](url, headers);
    } else if (typeof httpClient.del === "function") {
      res = httpClient.del(url, headers);
    } else {
      throw new Error("HTTP DELETE is not supported by current runtime");
    }
  } else {
    throw new Error("Unsupported HTTP method: " + m);
  }

  if (!res) {
    throw new Error("HTTP request failed: empty response received");
  }

  var status = Number(res.status);
  var parsed = parseResponseBody(res.body);

  if (status < 200 || status >= 300) {
    var errMsg = "HTTP " + status + " error";
    if (parsed.data && typeof parsed.data === "object" && parsed.data.message) {
      errMsg += ": " + parsed.data.message;
    } else if (parsed.rawBody) {
      errMsg += ": " + parsed.rawBody;
    }

    var err = new Error(errMsg);
    err.status = status;
    err.data = parsed.data;
    err.rawBody = parsed.rawBody;
    throw err;
  }

  return {
    status: status,
    data: parsed.data,
    rawBody: parsed.rawBody
  };
}

function get(url, headers) {
  return request("GET", url, { headers: headers });
}

function post(url, body, headers) {
  return request("POST", url, { body: body, headers: headers });
}

function put(url, body, headers) {
  return request("PUT", url, { body: body, headers: headers });
}

function del(url, headers) {
  return request("DELETE", url, { headers: headers });
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  "delete": del,
  del: del
};
