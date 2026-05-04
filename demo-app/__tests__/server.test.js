/**
 * Smoke tests for demo-vulnerable-app.
 * Goal: verify the app starts, routes respond, and auto-fix changes
 * don't break basic functionality before the security PR is created.
 *
 * These tests deliberately avoid asserting on security-sensitive behaviour —
 * the intentional vulnerabilities are tracked by CodeQL/Dependabot, not here.
 */

const request = require("supertest");
const app = require("../server");

describe("Health check", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("Route smoke tests — app responds without crashing", () => {
  it("GET /api/users responds (any non-5xx)", async () => {
    const res = await request(app).get("/api/users?id=1");
    expect(res.status).toBeLessThan(500);
  });

  it("GET /api/files with unknown file returns 404, not a crash", async () => {
    const res = await request(app).get("/api/files?file=nonexistent.txt");
    expect(res.status).toBe(404);
  });

  it("GET /search with query param responds without crashing", async () => {
    const res = await request(app).get("/search?q=test");
    expect(res.status).toBeLessThan(500);
  });

  it("GET /api/merge responds without crashing", async () => {
    const res = await request(app).get("/api/merge");
    expect(res.status).toBeLessThan(500);
  });

  it("GET /api/render with safe template responds without crashing", async () => {
    const res = await request(app).get(
      "/api/render?template=Hello%20World&data=test"
    );
    expect(res.status).toBeLessThan(500);
  });

  it("GET /api/preview with safe markdown responds without crashing", async () => {
    const res = await request(app).get(
      "/api/preview?md=Hello%20**world**"
    );
    expect(res.status).toBeLessThan(500);
  });
});
