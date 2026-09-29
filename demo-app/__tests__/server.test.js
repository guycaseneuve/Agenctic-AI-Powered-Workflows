/**
 * Smoke tests for demo-vulnerable-app.
 * Goal: verify the app starts, routes respond, and auto-fix changes
 * don't break basic functionality before the security PR is created.
 *
 * These tests deliberately avoid asserting on security-sensitive behaviour —
 * the intentional vulnerabilities are tracked by CodeQL/Dependabot, not here.
 */

const request = require("supertest");
process.env.DEMO_ERROR_TOKEN ||= "unit-test-demo-error-token";
const app = require("../server");

describe("Health check", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.timestamp).toBeDefined();
  });
});

describe("Synthetic App Insights error endpoint", () => {
  it("requires the configured test token", async () => {
    const res = await request(app).get("/api/test-error");
    expect(res.status).toBe(401);
  });

  it("returns a correlated synthetic 500 when authorized", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await request(app)
        .get("/api/test-error")
        .set("x-demo-error-token", process.env.DEMO_ERROR_TOKEN);

      expect(res.status).toBe(500);
      expect(res.body.application).toBe("demo-app");
      expect(res.body.error).toContain("Synthetic demo application failure");
      expect(res.body.correlationId).toBeDefined();
      expect(res.headers["x-correlation-id"]).toBe(res.body.correlationId);
      expect(log).toHaveBeenCalledWith(
        "Synthetic demo application failure",
        expect.objectContaining({ application: "demo-app", correlationId: res.body.correlationId })
      );
    } finally {
      log.mockRestore();
    }
  });

  it("returns displayName null and does not log a TypeError when profile is missing", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await request(app)
        .get("/api/test-bug")
        .set("x-demo-error-token", process.env.DEMO_ERROR_TOKEN);

      // Now the route safely returns 200 with displayName set to null when profile is absent
      expect(res.status).toBe(200);
      expect(res.body.displayName).toBeNull();
      // No TypeError should have been logged
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("disables intentionally vulnerable routes in production by default", () => {
    const { vulnerableDemoRoutesEnabled } = require("../server");
    expect(vulnerableDemoRoutesEnabled({ NODE_ENV: "production" })).toBe(false);
    expect(vulnerableDemoRoutesEnabled({ NODE_ENV: "production", ENABLE_VULNERABLE_DEMOS: "true" })).toBe(true);
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
