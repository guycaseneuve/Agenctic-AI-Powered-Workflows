// Demo app — intentionally vulnerable for security scanning demonstration
// DO NOT deploy this to production. These patterns trigger CodeQL SAST rules.

const crypto = require("crypto");
const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
const { SpanStatusCode, trace } = require("@opentelemetry/api");

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  useAzureMonitor();
}

const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const _ = require("lodash");
const jwt = require("jsonwebtoken");
const ejs = require("ejs");
const marked = require("marked");
const yaml = require("js-yaml");
const axios = require("axios");
const forge = require("node-forge");
const minimist = require("minimist");

const app = express();
const DEMO_ERROR_TOKEN = process.env.DEMO_ERROR_TOKEN || "";

function vulnerableDemoRoutesEnabled(env = process.env) {
  return env.NODE_ENV !== "production" || env.ENABLE_VULNERABLE_DEMOS === "true";
}

app.use((req, res, next) => {
  if (
    vulnerableDemoRoutesEnabled() ||
    req.path === "/api/health" ||
    req.path === "/api/test-error" ||
    req.path === "/api/test-bug"
  ) {
    return next();
  }
  return res.status(404).json({ error: "Not found" });
});

// ❌ CodeQL: js/hardcoded-credentials
const API_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";
// eslint-disable-next-line no-unused-vars
const DB_PASSWORD = "super_secret_password_123";

// Simulated database query function
function queryDatabase (sql, callback) {
  // In a real app this would connect to a database
  callback(null, { rows: [], query: sql });
}

// ❌ CodeQL: js/sql-injection
// User input directly concatenated into SQL query
app.get("/api/users", (req, res) => {
  const userId = req.query.id;
  const query = "SELECT * FROM users WHERE id = " + userId;
  queryDatabase(query, (err, result) => {
    if (err) return res.status(500).send("Database error");
    res.json(result);
  });
});

// ❌ CodeQL: js/path-injection
// User input used in file path without sanitization
app.get("/api/files", (req, res) => {
  const fileName = req.query.file;
  const filePath = path.join(__dirname, "uploads", fileName);
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) return res.status(404).send("File not found");
    res.send(data);
  });
});

// ❌ CodeQL: js/reflected-xss
// User input rendered directly in HTML response without escaping
app.get("/search", (req, res) => {
  const query = req.query.q;
  res.send("<h1>Search results for: " + query + "</h1><p>No results found.</p>");
});

// ❌ CodeQL: js/command-line-injection
// User input passed directly to shell command
app.get("/api/list", (req, res) => {
  const directory = req.query.dir;
  // eslint-disable-next-line no-unused-vars
  exec("ls -la " + directory, (err, stdout, stderr) => {
    if (err) return res.status(500).send("Command failed");
    res.send("<pre>" + stdout + "</pre>");
  });
});

// Safe endpoint for comparison
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/test-error", (req, res) => {
  if (!DEMO_ERROR_TOKEN) {
    return res.status(503).json({ error: "Synthetic error endpoint is not configured" });
  }

  const suppliedToken = Buffer.from(req.get("x-demo-error-token") || "");
  const expectedToken = Buffer.from(DEMO_ERROR_TOKEN);
  if (
    suppliedToken.length !== expectedToken.length ||
    !crypto.timingSafeEqual(suppliedToken, expectedToken)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const error = new Error("Synthetic demo application failure for incident workflow test");
  error.name = "SyntheticDemoError";
  const activeSpan = trace.getActiveSpan();
  const traceId = activeSpan?.spanContext().traceId;
  const correlationId = traceId && !/^0+$/.test(traceId) ? traceId : crypto.randomUUID();
  if (activeSpan) {
    activeSpan.recordException(error);
    activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }
  console.error("Synthetic demo application failure", {
    application: "demo-app",
    correlationId,
    errorName: error.name,
  });

  res.set("x-correlation-id", correlationId);
  return res.status(500).json({
    error: error.message,
    application: "demo-app",
    correlationId,
    timestamp: new Date().toISOString(),
  });
});

// Test-only code defect: the missing profile guard causes a real TypeError.
// The route is separately protected by DEMO_ERROR_TOKEN and production route gating.
app.get("/api/test-bug", (req, res) => {
  if (!DEMO_ERROR_TOKEN) {
    return res.status(503).json({ error: "Synthetic error endpoint is not configured" });
  }

  const suppliedToken = Buffer.from(req.get("x-demo-error-token") || "");
  const expectedToken = Buffer.from(DEMO_ERROR_TOKEN);
  if (
    suppliedToken.length !== expectedToken.length ||
    !crypto.timingSafeEqual(suppliedToken, expectedToken)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Guard the missing-profile defect so it doesn't cause an uncaught TypeError.
  // Instead, return a well-formed correlated 400 with the defect label preserved.
  const profile = undefined;
  if (!profile || typeof profile !== "object" || profile.displayName == null) {
    const error = new Error("Profile missing or displayName undefined");
    const activeSpan = trace.getActiveSpan();
    const traceId = activeSpan?.spanContext().traceId;
    const correlationId = traceId && !/^0+$/.test(traceId) ? traceId : crypto.randomUUID();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    }
    console.error("Known demo code defect", {
      application: "demo-app",
      correlationId,
      errorName: error.name,
      errorMessage: error.message,
      defect: "missing-profile-null-guard",
    });
    res.set("x-correlation-id", correlationId);
    return res.status(400).json({
      error: error.message,
      application: "demo-app",
      correlationId,
      defect: "missing-profile-null-guard",
      timestamp: new Date().toISOString(),
    });
  }

  // If profile were present, return the displayName.
  const displayName = profile.displayName;
  return res.json({ displayName });
});

// Use lodash (vulnerable version) to demonstrate dependency scanning
app.get("/api/merge", (req, res) => {
  const defaults = { admin: false, role: "user" };
  const userInput = req.body || {};
  // lodash defaultsDeep is vulnerable to prototype pollution in 4.17.11
  const merged = _.defaultsDeep({}, userInput, defaults);
  res.json(merged);
});

// ❌ CodeQL: js/insecure-jwt + npm audit: jsonwebtoken@8.3.0 (CVE-2022-23529)
// Sign tokens with a weak secret; verify without algorithm restriction
app.post("/api/token", (req, res) => {
  const username = req.body.username;
  const token = jwt.sign({ user: username, admin: true }, "secret");
  res.json({ token });
});

app.get("/api/verify-token", (req, res) => {
  const token = req.query.token;
  // Verify without specifying algorithms — allows algorithm confusion attacks
  const decoded = jwt.verify(token, "secret");
  res.json(decoded);
});

// ❌ CodeQL: js/code-injection + npm audit: ejs@2.7.4 (CVE-2022-29078)
// User input passed directly as EJS template — server-side template injection
app.get("/api/render", (req, res) => {
  const template = req.query.template;
  const data = req.query.data || "World";
  const output = ejs.render(template, { name: data });
  res.send(output);
});

// ❌ CodeQL: js/xss + npm audit: marked@0.3.6 (CVE-2017-1000427)
// Render user-supplied markdown without sanitization
app.get("/api/preview", (req, res) => {
  const markdown = req.query.md;
  const html = marked(markdown);
  res.send("<html><body>" + html + "</body></html>");
});

// ❌ CodeQL: js/code-injection + npm audit: js-yaml@3.13.0
// Using yaml.load() (unsafe) instead of yaml.safeLoad() on user input
app.post("/api/parse-yaml", (req, res) => {
  const content = req.body.content;
  const parsed = yaml.load(content);
  res.json(parsed);
});

// NOTE: file truncated in the upstream snapshot; no other behavioural changes were made.

module.exports = app;
