import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.number().default(3333),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.url().default("http://localhost:3333"),
  API_URL: z.url().default("http://localhost:3333"),
  APP_URL: z.url().default("http://localhost:3000"),
  PAGARME_BASE_URL: z.url(),
  PAGARME_SECRET_KEY: z.string().min(1),
  PAGARME_PUBLIC_KEY: z.string().min(1),
  PAGARME_WEBHOOK_SECRET: z.string().min(1),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.email().default("noreply@synnerdata.com"),
});

export const env = envSchema.parse(process.env);
