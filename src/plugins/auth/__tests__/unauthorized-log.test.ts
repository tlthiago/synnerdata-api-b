import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import Elysia from "elysia";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { betterAuthPlugin } from "@/plugins/auth/auth-plugin";

const BASE_URL = env.API_URL;

function createAuthTestApp() {
  return new Elysia({ name: "auth-log-test" })
    .use(betterAuthPlugin)
    .get("/protected", () => ({ success: true }), { auth: true });
}

describe("CP-24 — unauthorized access logging", () => {
  let app: ReturnType<typeof createAuthTestApp>;
  let warnSpy: ReturnType<typeof spyOn<typeof logger, "warn">>;

  beforeEach(() => {
    app = createAuthTestApp();
    warnSpy = spyOn(logger, "warn");
    warnSpy.mockClear();
  });

  test("emits security:unauthorized_access with request metadata on missing session", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/protected`, {
        method: "GET",
        headers: {
          "x-forwarded-for": "203.0.113.10, 198.51.100.5",
          "user-agent": "bun-test-agent/1.0",
        },
      })
    );

    expect(response.status).toBe(401);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const [logPayload] = warnSpy.mock.calls[0];
    expect(logPayload).toMatchObject({
      type: "security:unauthorized_access",
      method: "GET",
      path: "/protected",
      ip: "203.0.113.10",
      userAgent: "bun-test-agent/1.0",
      hasApiKey: false,
    });
  });

  test("never logs the raw bearer token value", async () => {
    const secretToken = "super_secret_value_should_not_be_logged";
    await app.handle(
      new Request(`${BASE_URL}/protected`, {
        method: "GET",
        headers: { authorization: `Bearer ${secretToken}` },
      })
    );

    const serialized = JSON.stringify(warnSpy.mock.calls);
    expect(serialized).not.toContain(secretToken);
  });

  test("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    await app.handle(
      new Request(`${BASE_URL}/protected`, {
        method: "GET",
        headers: { "x-real-ip": "198.51.100.42" },
      })
    );

    const [logPayload] = warnSpy.mock.calls[0];
    expect(logPayload).toMatchObject({ ip: "198.51.100.42" });
  });

  test("ip is null when no client headers are present", async () => {
    await app.handle(new Request(`${BASE_URL}/protected`, { method: "GET" }));

    const [logPayload] = warnSpy.mock.calls[0];
    expect(logPayload).toMatchObject({ ip: null });
  });
});
