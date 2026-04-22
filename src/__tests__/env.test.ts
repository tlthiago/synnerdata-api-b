import { describe, expect, test } from "bun:test";
import { envSchema } from "@/env";

/**
 * RU-1 — hardening do `src/env.ts`.
 *
 * Cobre débitos #14-19 da seção 7.7 de `docs/improvements/api-infrastructure-checklist.md`:
 *   #14 — BETTER_AUTH_SECRET sem .min(32)
 *   #15 — SMTP_USER / SMTP_PASSWORD opcional sem refine condicional em produção
 *   #16 — PII_ENCRYPTION_KEY.length(64) não valida hex
 *   #17 — SMTP_FROM: z.string() aceita não-email
 *   #18 — NODE_ENV não validado no schema
 *   #19 — CORS_ORIGIN formato comma-separated implícito (documentar via .describe())
 *
 * Política de teste: categoria (3) — teste mínimo focado. Cobre apenas as
 * regras novas, não toda a superfície do env.
 */

// Valores mínimos válidos — reusados em cada teste com overrides pontuais.
const VALID_ENV = {
  NODE_ENV: "test",
  PORT: "3333",
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:password@localhost:5432/test",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3333",
  API_URL: "http://localhost:3333",
  APP_URL: "http://localhost:3000",
  PAGARME_BASE_URL: "https://api.pagar.me/core/v5",
  PAGARME_SECRET_KEY: "sk_test_xxx",
  PAGARME_PUBLIC_KEY: "pk_test_xxx",
  PAGARME_WEBHOOK_USERNAME: "webhook_user",
  PAGARME_WEBHOOK_PASSWORD: "webhook_pass",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  SMTP_FROM: "noreply@example.com",
  SUPER_ADMIN_EMAILS: "",
  ADMIN_EMAILS: "",
  INTERNAL_API_KEY: "a".repeat(32),
  PII_ENCRYPTION_KEY: "f".repeat(64),
} as const;

describe("envSchema — BETTER_AUTH_SECRET minimum length (débito #14)", () => {
  test("rejects value shorter than 32 chars", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, BETTER_AUTH_SECRET: "a".repeat(31) })
    ).toThrow();
  });

  test("accepts value with exactly 32 chars", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, BETTER_AUTH_SECRET: "a".repeat(32) })
    ).not.toThrow();
  });

  test("accepts value longer than 32 chars", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, BETTER_AUTH_SECRET: "a".repeat(64) })
    ).not.toThrow();
  });
});

describe("envSchema — PII_ENCRYPTION_KEY hex format (débito #16)", () => {
  test("rejects 64-char non-hex value", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, PII_ENCRYPTION_KEY: "z".repeat(64) })
    ).toThrow();
  });

  test("rejects 64-char value with mixed non-hex characters", () => {
    const almostHex = `${"0".repeat(63)}G`;
    expect(() =>
      envSchema.parse({ ...VALID_ENV, PII_ENCRYPTION_KEY: almostHex })
    ).toThrow();
  });

  test("accepts 64 lowercase hex chars", () => {
    expect(() =>
      envSchema.parse({
        ...VALID_ENV,
        PII_ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
      })
    ).not.toThrow();
  });

  test("accepts 64 uppercase hex chars", () => {
    expect(() =>
      envSchema.parse({
        ...VALID_ENV,
        PII_ENCRYPTION_KEY: "0123456789ABCDEF".repeat(4),
      })
    ).not.toThrow();
  });

  test("rejects value shorter than 64 chars", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, PII_ENCRYPTION_KEY: "a".repeat(63) })
    ).toThrow();
  });

  test("rejects value longer than 64 chars", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, PII_ENCRYPTION_KEY: "a".repeat(65) })
    ).toThrow();
  });
});

describe("envSchema — SMTP_FROM email validation (débito #17)", () => {
  test("rejects non-email string", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, SMTP_FROM: "not-an-email" })
    ).toThrow();
  });

  test("rejects plain word", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, SMTP_FROM: "noreply" })
    ).toThrow();
  });

  test("accepts valid email address", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, SMTP_FROM: "noreply@synnerdata.com" })
    ).not.toThrow();
  });
});

describe("envSchema — NODE_ENV enum (débito #18)", () => {
  test("rejects invalid value (typo)", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, NODE_ENV: "prdoction" })
    ).toThrow();
  });

  test("rejects arbitrary string", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, NODE_ENV: "staging" })
    ).toThrow();
  });

  test.each([
    "development",
    "production",
    "test",
  ] as const)("accepts %s", (value) => {
    // production precisa de SMTP_USER/SMTP_PASSWORD (db #15) — para este teste de enum,
    // passamos valores válidos também
    expect(() =>
      envSchema.parse({
        ...VALID_ENV,
        NODE_ENV: value,
        ...(value === "production"
          ? { SMTP_USER: "user@smtp", SMTP_PASSWORD: "pass" }
          : {}),
      })
    ).not.toThrow();
  });

  test("defaults to development when NODE_ENV is absent", () => {
    const { NODE_ENV: _, ...rest } = VALID_ENV;
    const parsed = envSchema.parse(rest);
    expect(parsed.NODE_ENV).toBe("development");
  });
});

describe("envSchema — SMTP credentials required in production (débito #15)", () => {
  test("rejects production without SMTP_USER", () => {
    expect(() =>
      envSchema.parse({
        ...VALID_ENV,
        NODE_ENV: "production",
        SMTP_PASSWORD: "pass",
      })
    ).toThrow();
  });

  test("rejects production without SMTP_PASSWORD", () => {
    expect(() =>
      envSchema.parse({
        ...VALID_ENV,
        NODE_ENV: "production",
        SMTP_USER: "user@smtp",
      })
    ).toThrow();
  });

  test("rejects production without either credential", () => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, NODE_ENV: "production" })
    ).toThrow();
  });

  test("accepts production with both SMTP_USER and SMTP_PASSWORD", () => {
    expect(() =>
      envSchema.parse({
        ...VALID_ENV,
        NODE_ENV: "production",
        SMTP_USER: "user@smtp",
        SMTP_PASSWORD: "pass",
      })
    ).not.toThrow();
  });

  test.each([
    "development",
    "test",
  ] as const)("accepts %s without SMTP credentials", (nodeEnv) => {
    expect(() =>
      envSchema.parse({ ...VALID_ENV, NODE_ENV: nodeEnv })
    ).not.toThrow();
  });
});
