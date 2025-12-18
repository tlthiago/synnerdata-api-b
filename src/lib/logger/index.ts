import { randomUUID } from "node:crypto";
import {
  logger as elysiaLogger,
  formatters,
  isContext,
} from "@bogeychan/elysia-logger";
import { Elysia } from "elysia";
import pino from "pino";

const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

/**
 * Generates a request ID using UUIDv4
 */
const generateRequestId = (): string => `req-${randomUUID()}`;

const getLogLevel = () => {
  if (isTest) {
    return "silent";
  }
  if (isProduction) {
    return "info";
  }
  return "debug";
};

const customLogFormatter = (object: Record<string, unknown>) => {
  // Check if it's an Elysia context
  if (isContext(object)) {
    const ctx = object as {
      request: Request;
      store: { responseTime?: number };
      isError: boolean;
      code?: string;
      error?: Error | { message?: string; code?: string; response?: string };
    };

    const log: Record<string, unknown> = {
      method: ctx.request.method,
      url: new URL(ctx.request.url).pathname,
    };

    if (ctx.isError) {
      log.code = ctx.code;
      if (ctx.error && "message" in ctx.error) {
        log.message = ctx.error.message;
      } else if (ctx.error && "code" in ctx.error && "response" in ctx.error) {
        log.message = `HTTP ${ctx.error.code}: ${ctx.error.response}`;
      } else {
        log.message = "Unknown error";
      }
    } else if (ctx.store.responseTime) {
      log.responseTime = `${Math.round(ctx.store.responseTime)}ms`;
    }

    return log;
  }

  // Fallback to default formatter
  return formatters.log(object);
};

export const logger = pino({
  level: getLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
    log: customLogFormatter,
  },
  transport:
    isProduction || isTest
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

export const loggerPlugin = new Elysia({ name: "logger" })
  .derive({ as: "global" }, () => ({
    requestId: generateRequestId(),
    requestStart: performance.now(),
  }))
  .use(
    elysiaLogger({
      level: getLogLevel(),
      formatters: {
        ...formatters,
        level: (label) => ({ level: label }),
        log: customLogFormatter,
      },
      transport:
        isProduction || isTest
          ? undefined
          : { target: "pino-pretty", options: { colorize: true } },
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
