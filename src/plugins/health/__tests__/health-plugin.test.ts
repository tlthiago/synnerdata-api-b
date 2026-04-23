import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";

const BASE_URL = env.API_URL;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

describe("GET /health", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should return health status with database check", async () => {
    const response = await app.handle(new Request(`${BASE_URL}/health`));

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.version).toBeString();
    expect(body.data.uptime).toBeNumber();
    expect(body.data.checks).toBeObject();
    expect(body.data.checks.database).toBeObject();
    expect(body.data.checks.database.status).toBe("healthy");
    expect(body.data.checks.database.latencyMs).toBeNumber();
  });

  test("should return version from package.json", async () => {
    const response = await app.handle(new Request(`${BASE_URL}/health`));
    const body = await response.json();

    expect(body.data.version).toMatch(SEMVER_PATTERN);
  });

  test("should return uptime as positive number", async () => {
    const response = await app.handle(new Request(`${BASE_URL}/health`));
    const body = await response.json();

    expect(body.data.uptime).toBeGreaterThanOrEqual(0);
  });

  test("should return database latency in milliseconds", async () => {
    const response = await app.handle(new Request(`${BASE_URL}/health`));
    const body = await response.json();

    expect(body.data.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.data.checks.database.latencyMs).toBeLessThan(5000);
  });
});

describe("GET /health/live", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should return ok status for liveness probe", async () => {
    const response = await app.handle(new Request(`${BASE_URL}/health/live`));

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
  });

  test("should respond quickly for load balancer checks", async () => {
    const start = performance.now();
    const response = await app.handle(new Request(`${BASE_URL}/health/live`));
    const duration = performance.now() - start;

    expect(response.status).toBe(200);
    expect(duration).toBeLessThan(100);
  });
});

describe("GET /", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should redirect to /health", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/`, { redirect: "manual" })
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/health");
  });
});
