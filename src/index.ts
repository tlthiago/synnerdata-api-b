import "@/lib/zod-config";
import "@/lib/sentry";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { z } from "zod";
import { pool } from "./db";
import { env, isProduction } from "./env";
import { betterAuthPlugin, OpenAPI } from "./lib/auth-plugin";
import { parseOrigins } from "./lib/cors";
import { cronPlugin } from "./lib/cron-plugin";
import { errorPlugin } from "./lib/errors/error-plugin";
import { logger, loggerPlugin } from "./lib/logger";
import { setupGracefulShutdown } from "./lib/shutdown/shutdown";
import { adminController } from "./modules/admin";
import { auditController } from "./modules/audit";
import { employeeController } from "./modules/employees";
import { registerEmployeeListeners } from "./modules/employees/hooks/listeners";
import { occurrencesController } from "./modules/occurrences";
import { organizationController } from "./modules/organizations";
import { paymentsController } from "./modules/payments";
import { registerPaymentListeners } from "./modules/payments/hooks/listeners";
import { publicController } from "./modules/public";
import { healthPlugin } from "./plugins/health/health-plugin";

const corsOrigins = parseOrigins(env.CORS_ORIGIN);

const RATE_LIMIT_SKIP_PATHS = ["/health", "/health/live", "/api/auth"];

const REQUEST_IDLE_TIMEOUT_SECONDS = 30;

// biome-ignore lint/suspicious/noExplicitAny: Zod v4 internal API for extracting check error messages
function extractErrorMessages(zodDef: any): Record<string, string> | null {
  const { checks } = zodDef;
  if (!(checks && Array.isArray(checks))) {
    return null;
  }

  const errorMessages: Record<string, string> = {};
  for (const check of checks) {
    const checkDef = check._zod?.def;
    if (!checkDef?.error || typeof checkDef.error !== "function") {
      continue;
    }
    try {
      const msg = checkDef.error({ input: "" });
      if (typeof msg === "string") {
        const key = checkDef.format
          ? `${checkDef.check}:${checkDef.format}`
          : checkDef.check;
        errorMessages[key] = msg;
      }
    } catch {
      // Skip checks that can't produce a message
    }
  }

  return Object.keys(errorMessages).length > 0 ? errorMessages : null;
}

const app = new Elysia({
  serve: {
    maxRequestBodySize: 1024 * 1024 * 10,
    idleTimeout: REQUEST_IDLE_TIMEOUT_SECONDS,
  },
})
  .headers({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    ...(isProduction && {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    }),
  })
  .use(errorPlugin)
  .use(loggerPlugin)
  .use(healthPlugin)
  .use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
      exposeHeaders: [
        "X-Request-ID",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
      ],
      maxAge: 86_400,
    })
  )
  .use(
    rateLimit({
      duration: 60_000,
      max: 100,
      headers: true,
      skip: (request) => {
        const url = new URL(request.url);
        return RATE_LIMIT_SKIP_PATHS.some(
          (path) => url.pathname === path || url.pathname.startsWith(`${path}/`)
        );
      },
    })
  )
  .use(betterAuthPlugin)
  .use(
    openapi({
      mapJsonSchema: {
        zod: (schema: z.ZodType) =>
          z.toJSONSchema(schema, {
            unrepresentable: "any",
            override: (ctx) => {
              if (ctx.zodSchema._zod.def.type === "date") {
                ctx.jsonSchema.type = "string";
                ctx.jsonSchema.format = "date-time";
              }

              const messages = extractErrorMessages(ctx.zodSchema._zod.def);
              if (messages) {
                ctx.jsonSchema["x-error-messages"] = messages;
              }
            },
          }),
      },
      documentation: {
        info: {
          title: "Synnerdata API",
          version: "1.0.0",
        },
        components: await OpenAPI.components,
        paths: isProduction ? {} : await OpenAPI.getPaths(),
      },
    })
  )
  .use(cronPlugin)
  .use(organizationController)
  .use(employeeController)
  .use(occurrencesController)
  .use(paymentsController)
  .use(auditController)
  .use(adminController)
  .use(publicController)
  .get("/", ({ redirect }) => redirect("/health"));

registerPaymentListeners();
registerEmployeeListeners();

app.listen(env.PORT, ({ hostname, port }) => {
  logger.info({
    type: "app:start",
    message: `🦊 Elysia is running at ${hostname}:${port}`,
    host: hostname,
    port,
  });
});

setupGracefulShutdown({
  app,
  pool,
  gracePeriodMs: isProduction ? 5000 : 1000,
});
