import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { toJSONSchema } from "zod";
import { env } from "./env";
import { betterAuthPlugin, OpenAPI } from "./lib/auth-plugin";
import { cronPlugin } from "./lib/cron-plugin";
import { errorPlugin } from "./lib/errors/error-plugin";
import { healthPlugin } from "./lib/health";
import { logger, loggerPlugin } from "./lib/logger";
import { paymentsController } from "./modules/payments";

const isProduction = process.env.NODE_ENV === "production";

const RATE_LIMIT_SKIP_PATHS = ["/health", "/health/live", "/auth/api"];

const app = new Elysia({
  serve: {
    maxRequestBodySize: 1024 * 1024 * 10,
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
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
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
        zod: toJSONSchema,
      },
      documentation: {
        info: {
          title: "Synnerdata API",
          version: "1.0.0",
        },
        components: await OpenAPI.components,
        paths: await OpenAPI.getPaths(),
      },
    })
  )
  .use(cronPlugin)
  .use(paymentsController)
  .get("/", ({ redirect }) => redirect("/health"))
  .listen(env.PORT);

logger.info({
  type: "app:start",
  message: `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
  host: app.server?.hostname,
  port: app.server?.port,
});
