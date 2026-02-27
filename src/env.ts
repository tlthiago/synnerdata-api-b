import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z.string(),
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
  SMTP_FROM: z.string().default("noreply@synnerdata.com"),
  // Admin emails - users with these emails will be assigned admin roles on signup
  SUPER_ADMIN_EMAILS: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""),
  // Internal API key for scheduled jobs endpoints
  INTERNAL_API_KEY: z.string().min(32),
  // PII Encryption key - 32 bytes hex (64 characters)
  // Generate with: openssl rand -hex 32
  PII_ENCRYPTION_KEY: z.string().length(64),
});

export const env = envSchema.parse(process.env);
