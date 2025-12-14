import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { loggerPlugin } from "..";

const REQUEST_ID_PATTERN = /^req-[0-9a-f-]+$/;
const UUID_V7_PATTERN =
  /^req-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("Logger Plugin", () => {
  describe("X-Request-ID Header", () => {
    test("should include X-Request-ID in response headers", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", () => ({ message: "ok" }));

      const response = await app.handle(new Request("http://localhost/test"));
      const requestId = response.headers.get("X-Request-ID");

      expect(requestId).toBeDefined();
      expect(requestId).toMatch(REQUEST_ID_PATTERN);
    });

    test("should generate unique request IDs", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", () => ({ message: "ok" }));

      const response1 = await app.handle(new Request("http://localhost/test"));
      const response2 = await app.handle(new Request("http://localhost/test"));

      const requestId1 = response1.headers.get("X-Request-ID");
      const requestId2 = response2.headers.get("X-Request-ID");

      expect(requestId1).toBeDefined();
      expect(requestId2).toBeDefined();
      expect(requestId1).not.toBe(requestId2);
    });

    test("should use UUID v7 format", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", () => ({ message: "ok" }));

      const response = await app.handle(new Request("http://localhost/test"));
      const requestId = response.headers.get("X-Request-ID");

      expect(requestId).toMatch(UUID_V7_PATTERN);
    });
  });

  describe("Request ID in context", () => {
    test("should provide requestId in handler context", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", ({ requestId }) => ({ requestId }));

      const response = await app.handle(new Request("http://localhost/test"));
      const body = await response.json();

      expect(body.requestId).toBeDefined();
      expect(body.requestId).toMatch(REQUEST_ID_PATTERN);
    });

    test("should match requestId in header and context", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", ({ requestId }) => ({ requestId }));

      const response = await app.handle(new Request("http://localhost/test"));
      const headerRequestId = response.headers.get("X-Request-ID");
      const body = await response.json();

      expect(headerRequestId).toBe(body.requestId);
    });
  });

  describe("Request start time", () => {
    test("should provide requestStart in handler context", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", ({ requestStart }) => ({ requestStart }));

      const response = await app.handle(new Request("http://localhost/test"));
      const body = await response.json();

      expect(body.requestStart).toBeDefined();
      expect(typeof body.requestStart).toBe("number");
      expect(body.requestStart).toBeGreaterThan(0);
    });
  });
});
