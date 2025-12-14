import { createPinoLogger } from "@bogeychan/elysia-logger";
import { Elysia } from "elysia";

const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

const getLogLevel = () => {
  if (isTest) {
    return "silent";
  }
  if (isProduction) {
    return "info";
  }
  return "debug";
};

export const logger = createPinoLogger({
  level: getLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport:
    isProduction || isTest
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

export const loggerPlugin = new Elysia({ name: "logger" })
  .derive({ as: "global" }, () => ({
    requestId: `req-${Bun.randomUUIDv7()}`,
    requestStart: performance.now(),
  }))
  .use(
    logger.into({
      autoLogging: {
        ignore: (ctx) => {
          const path = new URL(ctx.request.url).pathname;
          return (
            path === "/health" ||
            path === "/health/live" ||
            path.startsWith("/auth/api")
          );
        },
      },
    })
  )
  .onAfterHandle({ as: "global" }, ({ set, requestId }) => {
    set.headers["X-Request-ID"] = requestId;
  })
  .onError({ as: "global" }, ({ log, error, requestId, request }) => {
    if (!log) {
      return;
    }

    log.error({
      type: "http:error",
      requestId,
      path: new URL(request.url).pathname,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: isProduction ? undefined : error.stack,
            }
          : { message: String(error) },
    });
  });
