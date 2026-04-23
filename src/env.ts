import "dotenv/config";
import { z } from "zod";

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
    SMTP_PORT: z.coerce.number().default(1027),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.email().default("noreply@synnerdata.com"),
    SMTP_FROM_NAME: z.string().min(1).optional(),
    SUPER_ADMIN_EMAILS: z.string().default(""),
    ADMIN_EMAILS: z.string().default(""),
    INTERNAL_API_KEY: z.string().min(32),
    PII_ENCRYPTION_KEY: z
      .string()
      .regex(
        /^[0-9a-fA-F]{64}$/,
        "PII_ENCRYPTION_KEY must be 64 hexadecimal characters (generate with: openssl rand -hex 32)"
      ),
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
export const isDev = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
