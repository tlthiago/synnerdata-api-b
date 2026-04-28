import { describe, expect, test } from "bun:test";
import { AppError } from "@/lib/errors/base-error";
import { BadRequestError } from "@/lib/errors/http-errors";

describe("BadRequestError", () => {
  test("defaults to status 400 and code BAD_REQUEST", () => {
    const error = new BadRequestError("Requisição inválida");

    expect(error.status).toBe(400);
    expect(error.code).toBe("BAD_REQUEST");
    expect(error.message).toBe("Requisição inválida");
    expect(error.details).toBeUndefined();
  });

  test("overrides code when options.code is provided", () => {
    const error = new BadRequestError("Acesso negado", {
      code: "ADMIN_ACCOUNT_DELETE_FORBIDDEN",
    });

    expect(error.code).toBe("ADMIN_ACCOUNT_DELETE_FORBIDDEN");
    expect(error.status).toBe(400);
  });

  test("exposes details on toResponse() when provided", () => {
    const error = new BadRequestError("Senha incorreta.", {
      code: "INVALID_PASSWORD",
      details: { attempts: 3 },
    });

    const response = error.toResponse();

    expect(response.success).toBe(false);
    expect(response.error.code).toBe("INVALID_PASSWORD");
    expect(response.error.message).toBe("Senha incorreta.");
    expect(response.error.details).toEqual({ attempts: 3 });
  });

  test("is instanceof AppError and Error", () => {
    const error = new BadRequestError("Inválido");

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BadRequestError");
  });

  test("supports each anonymize-flow code", () => {
    const codes = [
      "ADMIN_ACCOUNT_DELETE_FORBIDDEN",
      "ACTIVE_SUBSCRIPTION",
      "ORGANIZATION_HAS_MEMBERS",
      "INVALID_PASSWORD",
    ] as const;

    for (const code of codes) {
      const error = new BadRequestError("msg", { code });
      expect(error.code).toBe(code);
      expect(error.status).toBe(400);
    }
  });
});
