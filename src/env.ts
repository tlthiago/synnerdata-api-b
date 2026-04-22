import "dotenv/config";
import { z } from "zod";

/**
 * Environment variables schema.
 *
 * Validated at application boot via `envSchema.parse(process.env)`.
 * Exported for testing purposes — see `src/__tests__/env.test.ts`.
 *
 * Hardening (RU-1):
 *   - NODE_ENV restricted to enum (development/production/test)
 *   - BETTER_AUTH_SECRET requires minimum 32 characters
 *   - PII_ENCRYPTION_KEY must be 64 hex characters (openssl rand -hex 32)
 *   - SMTP_FROM must be a valid email
 *   - In production, SMTP_USER and SMTP_PASSWORD are mandatory
 *   - CORS_ORIGIN format (comma-separated origins) documented via .describe()
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(3333),
    CORS_ORIGIN: z
      .string()
      .default("http://localhost:3000")
      .describe(
        "Comma-separated list of allowed CORS origins. Parsed by parseOrigins() in lib/cors.ts"
      ),
    DATABASE_URL: z.url().startsWith("postgresql://"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().default("http://localhost:3333"),
    API_URL: z.url().default("http://localhost:3333"),
    APP_URL: z.url().default("http://localhost:3000"),
    PAGARME_BASE_URL: z.url(),
    PAGARME_SECRET_KEY: z.string().min(1),
    PAGARME_PUBLIC_KEY: z.string().min(1),
    PAGARME_WEBHOOK_USERNAME: z.string().min(1),
    PAGARME_WEBHOOK_PASSWORD: z.string().min(1),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.email().default("noreply@synnerdata.com"),
    // Admin emails - users with these emails will be assigned admin roles on signup
    SUPER_ADMIN_EMAILS: z.string().default(""),
    ADMIN_EMAILS: z.string().default(""),
    // Internal API key for scheduled jobs endpoints
    INTERNAL_API_KEY: z.string().min(32),
    // PII Encryption key - 32 bytes hex (64 hexadecimal characters)
    // Generate with: openssl rand -hex 32
    PII_ENCRYPTION_KEY: z
      .string()
      .regex(
        /^[0-9a-fA-F]{64}$/,
        "PII_ENCRYPTION_KEY must be 64 hexadecimal characters (generate with: openssl rand -hex 32)"
      ),
    // Sentry/GlitchTip DSN for error tracking (optional — disabled when absent)
    SENTRY_DSN: z.url().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === "production") {
      if (!val.SMTP_USER) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_USER"],
          message: "SMTP_USER is required when NODE_ENV=production",
        });
      }
      if (!val.SMTP_PASSWORD) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_PASSWORD"],
          message: "SMTP_PASSWORD is required when NODE_ENV=production",
        });
      }
    }
  });

export const env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";
