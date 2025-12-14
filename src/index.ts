import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { toJSONSchema } from "zod";
import { env } from "./env";
import { betterAuthPlugin, OpenAPI } from "./lib/auth-plugin";
import { cronPlugin } from "./lib/cron-plugin";
import { errorPlugin } from "./lib/errors/error-plugin";
import { paymentsController } from "./modules/payments";

const app = new Elysia()
  .use(errorPlugin)
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
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
  .use(betterAuthPlugin)
  .use(cronPlugin)
  .use(paymentsController)
  .get("/", () => "Hello Elysia")
  .listen(env.PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
