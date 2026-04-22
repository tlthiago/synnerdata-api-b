import { beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { errorPlugin } from "@/plugins/errors/error-plugin";

const RATE_LIMIT_SKIP_PATHS = ["/health", "/health/live", "/api/auth"];

function createTestApp(maxRequests = 5) {
  return new Elysia()
    .use(errorPlugin)
    .use(
      rateLimit({
        duration: 60_000,
        max: maxRequests,
        headers: true,
        skip: (request) => {
          const url = new URL(request.url);
          return RATE_LIMIT_SKIP_PATHS.some(
            (path) =>
              url.pathname === path || url.pathname.startsWith(`${path}/`)
          );
        },
      })
    )
    .get("/test", () => ({ success: true, data: "ok" }))
    .get("/health", () => ({ status: "healthy" }))
    .get("/health/live", () => ({ status: "live" }))
    .get("/api/auth/session", () => ({ session: null }));
}

describe("Rate Limiting", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    app = createTestApp(5);
  });

  describe("rate limit headers", () => {
    test("should include RateLimit headers on requests", async () => {
      const response = await app.handle(new Request("http://localhost/test"));

      expect(response.status).toBe(200);
      expect(response.headers.get("RateLimit-Limit")).toBe("5");
      expect(response.headers.get("RateLimit-Remaining")).toBeDefined();
      expect(response.headers.get("RateLimit-Reset")).toBeDefined();
    });

    test("should decrement remaining count on each request", async () => {
      const testApp = createTestApp(10);

      const response1 = await testApp.handle(
        new Request("http://localhost/test")
      );
      const remaining1 = Number(response1.headers.get("RateLimit-Remaining"));

      const response2 = await testApp.handle(
        new Request("http://localhost/test")
      );
      const remaining2 = Number(response2.headers.get("RateLimit-Remaining"));

      expect(remaining2).toBe(remaining1 - 1);
    });
  });

  describe("rate limit enforcement", () => {
    test("should return 429 after exceeding limit", async () => {
      const testApp = createTestApp(3);

      for (let i = 0; i < 3; i++) {
        const response = await testApp.handle(
          new Request("http://localhost/test")
        );
        expect(response.status).toBe(200);
      }

      const response = await testApp.handle(
        new Request("http://localhost/test")
      );

      expect(response.status).toBe(429);
    });

    test("should return error body when rate limited", async () => {
      const testApp = createTestApp(1);

      await testApp.handle(new Request("http://localhost/test"));

      const response = await testApp.handle(
        new Request("http://localhost/test")
      );

      expect(response.status).toBe(429);
      const body = await response.text();
      expect(body).toContain("rate-limit");
    });
  });

  describe("skip paths", () => {
    test("should not include rate limit headers on /health", async () => {
      const response = await app.handle(new Request("http://localhost/health"));

      expect(response.status).toBe(200);
      expect(response.headers.get("RateLimit-Limit")).toBeNull();
    });

    test("should not include rate limit headers on /health/live", async () => {
      const response = await app.handle(
        new Request("http://localhost/health/live")
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("RateLimit-Limit")).toBeNull();
    });

    test("should not include rate limit headers on /api/auth/* paths", async () => {
      const response = await app.handle(
        new Request("http://localhost/api/auth/session")
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("RateLimit-Limit")).toBeNull();
    });

    test("should not count skipped paths against limit", async () => {
      const testApp = createTestApp(2);

      for (let i = 0; i < 5; i++) {
        await testApp.handle(new Request("http://localhost/health"));
      }

      const response = await testApp.handle(
        new Request("http://localhost/test")
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("RateLimit-Remaining")).toBe("1");
    });
  });
});
