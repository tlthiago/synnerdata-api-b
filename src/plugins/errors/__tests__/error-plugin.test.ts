import { beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { z } from "zod";
import { AppError } from "@/lib/errors/base-error";
import { errorPlugin, formatErrorDetail } from "@/plugins/errors/error-plugin";
import { loggerPlugin } from "@/plugins/logger/logger-plugin";

const REQUEST_ID_PATTERN = /^req-[0-9a-f-]{36}$/;

const testBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

class TestDomainError extends AppError {
  status = 400;
  code = "TEST_DOMAIN_ERROR";
  // biome-ignore lint/complexity/noUselessConstructor: Required to pass details to AppError
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

class TestNotFoundError extends AppError {
  status = 404;
  code = "TEST_NOT_FOUND";
  constructor(resourceId: string) {
    super(`Resource not found: ${resourceId}`, { resourceId });
  }
}

function createTestApp() {
  return new Elysia()
    .use(loggerPlugin)
    .use(errorPlugin)
    .post("/validate", ({ body }) => ({ success: true, data: body }), {
      body: testBodySchema,
    })
    .get("/domain-error", () => {
      throw new TestDomainError("Test error message", { extra: "info" });
    })
    .get("/domain-error-no-details", () => {
      throw new TestDomainError("Error without details");
    })
    .get("/not-found-error", () => {
      throw new TestNotFoundError("resource-123");
    })
    .get("/unhandled-error", () => {
      throw new Error("Unexpected internal failure");
    })
    .get("/success", () => ({ success: true, data: "ok" }));
}

describe("errorPlugin", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("validation errors (422)", () => {
    test("should return 422 with details for invalid email", async () => {
      const response = await app.handle(
        new Request("http://localhost/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid-email", name: "Test" }),
        })
      );

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Dados de requisição inválidos");
      expect(body.error.details).toBeArray();
      expect(body.error.details.length).toBeGreaterThan(0);
    });

    test("should return 422 with details for missing required field", async () => {
      const response = await app.handle(
        new Request("http://localhost/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com" }),
        })
      );

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details).toBeArray();
    });

    test("should return 422 with details for empty name", async () => {
      const response = await app.handle(
        new Request("http://localhost/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com", name: "" }),
        })
      );

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    test("should include path in validation details", async () => {
      const response = await app.handle(
        new Request("http://localhost/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid", name: "Test" }),
        })
      );

      const body = await response.json();
      const detail = body.error.details[0];
      expect(detail.path).toBeDefined();
      expect(detail.message).toBeDefined();
    });
  });

  describe("AppError handling", () => {
    test("should return domain error with correct status and code", async () => {
      const response = await app.handle(
        new Request("http://localhost/domain-error")
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("TEST_DOMAIN_ERROR");
      expect(body.error.message).toBe("Test error message");
      expect(body.error.details).toEqual({ extra: "info" });
    });

    test("should return domain error without details when not provided", async () => {
      const response = await app.handle(
        new Request("http://localhost/domain-error-no-details")
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("TEST_DOMAIN_ERROR");
      expect(body.error.message).toBe("Error without details");
      expect(body.error.details).toBeUndefined();
    });

    test("should return 404 for not found errors", async () => {
      const response = await app.handle(
        new Request("http://localhost/not-found-error")
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("TEST_NOT_FOUND");
      expect(body.error.message).toBe("Resource not found: resource-123");
      expect(body.error.details).toEqual({ resourceId: "resource-123" });
    });
  });

  describe("unhandled errors (500)", () => {
    test("should return generic message without stack trace", async () => {
      const response = await app.handle(
        new Request("http://localhost/unhandled-error")
      );

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Ocorreu um erro inesperado");
      expect(body.error.stack).toBeUndefined();
      expect(body.error.details).toBeUndefined();
    });

    test("should not expose internal error message", async () => {
      const response = await app.handle(
        new Request("http://localhost/unhandled-error")
      );

      const body = await response.json();
      expect(body.error.message).not.toContain("Unexpected internal failure");
    });
  });

  describe("NOT_FOUND errors (404)", () => {
    test("should return 404 for non-existent routes", async () => {
      const response = await app.handle(
        new Request("http://localhost/non-existent-route")
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Rota não encontrada");
    });
  });

  describe("success responses", () => {
    test("should not interfere with successful responses", async () => {
      const response = await app.handle(
        new Request("http://localhost/success")
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toBe("ok");
    });
  });

  describe("requestId in error envelope (RU-2)", () => {
    test("AppError response body carries requestId matching X-Request-ID header", async () => {
      const response = await app.handle(
        new Request("http://localhost/domain-error")
      );

      const body = await response.json();
      expect(body.error.requestId).toMatch(REQUEST_ID_PATTERN);
      expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
    });

    test("AppError 404 response body carries requestId matching X-Request-ID header", async () => {
      const response = await app.handle(
        new Request("http://localhost/not-found-error")
      );

      const body = await response.json();
      expect(body.error.requestId).toMatch(REQUEST_ID_PATTERN);
      expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
    });

    test("VALIDATION response body carries requestId matching X-Request-ID header", async () => {
      const response = await app.handle(
        new Request("http://localhost/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid", name: "Test" }),
        })
      );

      const body = await response.json();
      expect(body.error.requestId).toMatch(REQUEST_ID_PATTERN);
      expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
    });

    test("NOT_FOUND (unknown route) response body carries requestId matching X-Request-ID header", async () => {
      const response = await app.handle(
        new Request("http://localhost/non-existent-route")
      );

      const body = await response.json();
      expect(body.error.requestId).toMatch(REQUEST_ID_PATTERN);
      expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
    });

    test("unhandled 500 response body carries requestId matching X-Request-ID header", async () => {
      const response = await app.handle(
        new Request("http://localhost/unhandled-error")
      );

      const body = await response.json();
      expect(body.error.requestId).toMatch(REQUEST_ID_PATTERN);
      expect(response.headers.get("X-Request-ID")).toBe(body.error.requestId);
    });
  });
});

describe("formatErrorDetail — depth limit (CP-29)", () => {
  test("truncates cause chain at max depth (5)", () => {
    const leaf = new Error("leaf");
    const level5 = new Error("level 5", { cause: leaf });
    const level4 = new Error("level 4", { cause: level5 });
    const level3 = new Error("level 3", { cause: level4 });
    const level2 = new Error("level 2", { cause: level3 });
    const level1 = new Error("level 1", { cause: level2 });
    const root = new Error("root", { cause: level1 });

    const detail = formatErrorDetail(root);
    const getCauseAt = (depth: number): unknown => {
      let current: unknown = detail;
      for (let i = 0; i < depth; i++) {
        current = (current as { cause?: unknown }).cause;
      }
      return current;
    };

    expect((getCauseAt(5) as { message: string }).message).toBe("level 5");
    expect(getCauseAt(6)).toBe("[truncated: max depth 5 reached]");
  });

  test("does not overflow on cyclic cause", () => {
    const a = new Error("a") as Error & { cause?: Error };
    const b = new Error("b") as Error & { cause?: Error };
    a.cause = b;
    b.cause = a;

    expect(() => formatErrorDetail(a)).not.toThrow();

    const detail = formatErrorDetail(a);
    let current: unknown = detail;
    let depth = 0;
    while (
      current &&
      typeof current === "object" &&
      typeof (current as { cause?: unknown }).cause === "object"
    ) {
      current = (current as { cause: unknown }).cause;
      depth += 1;
      if (depth > 10) {
        throw new Error("unexpected unbounded recursion");
      }
    }
    expect((current as { cause: unknown }).cause).toBe(
      "[truncated: max depth 5 reached]"
    );
  });

  test("returns stringified value for non-Error input", () => {
    expect(formatErrorDetail("plain string")).toEqual({
      message: "plain string",
    });
    expect(formatErrorDetail(42)).toEqual({ message: "42" });
    expect(formatErrorDetail(null)).toEqual({ message: "null" });
  });
});
