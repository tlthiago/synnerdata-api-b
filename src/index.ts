import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { toJSONSchema } from "zod";
import { env } from "./env";
import { betterAuthPlugin, OpenAPI } from "./lib/auth-plugin";
import { cronPlugin } from "./lib/cron-plugin";
import { errorPlugin } from "./lib/errors/error-plugin";
import { healthPlugin } from "./lib/health";
import { logger, loggerPlugin } from "./lib/logger";
import { paymentsController } from "./modules/payments";

const app = new Elysia({
  serve: {
    maxRequestBodySize: 1024 * 1024 * 10,
  },
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
