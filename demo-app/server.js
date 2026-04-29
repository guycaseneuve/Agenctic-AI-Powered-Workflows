// Demo app — intentionally vulnerable for security scanning demonstration
// DO NOT deploy this to production. These patterns trigger CodeQL SAST rules.

const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const _ = require("lodash");

const app = express();

// ❌ CodeQL: js/hardcoded-credentials
const API_KEY = "sk_live_4eC39HqLyjWDarjtT1zdp7dc";
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
  exec("ls -la " + directory, (err, stdout, stderr) => {
    if (err) return res.status(500).send("Command failed");
    res.send("<pre>" + stdout + "</pre>");
  });
});

// Safe endpoint for comparison
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Use lodash (vulnerable version) to demonstrate dependency scanning
app.get("/api/merge", (req, res) => {
  const defaults = { admin: false, role: "user" };
  const userInput = req.body || {};
  // lodash defaultsDeep is vulnerable to prototype pollution in 4.17.11
  const merged = _.defaultsDeep({}, userInput, defaults);
  res.json(merged);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Demo app listening on port ${PORT}`);
  console.log(`API Key: ${API_KEY}`); // ❌ Logging credentials
});
