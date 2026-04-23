import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { AppError } from "@/lib/errors/base-error";
import { errorPlugin } from "@/plugins/error-handler/error-plugin";
import { loggerPlugin } from "../logger-plugin";

// UUIDv4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (version 4)
const UUID_V4_PATTERN =
  /^req-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID_PATTERN =
  /^req-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

    test("should use UUIDv4 format", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .get("/test", () => ({ message: "ok" }));

      const response = await app.handle(new Request("http://localhost/test"));
      const requestId = response.headers.get("X-Request-ID");

      expect(requestId).toMatch(UUID_V4_PATTERN);
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

  describe("Status code capture with errorPlugin", () => {
    class TestError extends AppError {
      status = 400;
      code = "TEST_ERROR";
    }

    class TestServerError extends AppError {
      status = 500;
      code = "TEST_SERVER_ERROR";
    }

    test("should return correct status for successful requests", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .use(errorPlugin)
        .get("/ok", () => ({ success: true }));

      const response = await app.handle(new Request("http://localhost/ok"));
      expect(response.status).toBe(200);
    });

    test("should return correct status for AppError (4xx)", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .use(errorPlugin)
        .get("/fail", () => {
          throw new TestError("bad request");
        });

      const response = await app.handle(new Request("http://localhost/fail"));
      expect(response.status).toBe(400);
    });

    test("should return correct status for AppError (5xx)", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .use(errorPlugin)
        .get("/crash", () => {
          throw new TestServerError("server error");
        });

      const response = await app.handle(new Request("http://localhost/crash"));
      expect(response.status).toBe(500);
    });

    test("should return 404 for unknown routes", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .use(errorPlugin)
        .get("/exists", () => ({ success: true }));

      const response = await app.handle(
        new Request("http://localhost/does-not-exist")
      );
      expect(response.status).toBe(404);
    });

    test("should include X-Request-ID in error responses", async () => {
      const app = new Elysia()
        .use(loggerPlugin)
        .use(errorPlugin)
        .get("/fail", () => {
          throw new TestError("bad request");
        });

      const response = await app.handle(new Request("http://localhost/fail"));
      const requestId = response.headers.get("X-Request-ID");

      expect(requestId).toBeDefined();
      expect(requestId).toMatch(REQUEST_ID_PATTERN);
    });
  });
});
