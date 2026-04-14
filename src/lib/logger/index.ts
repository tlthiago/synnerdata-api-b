import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import pino from "pino";
import { enterRequestContext, getRequestId } from "@/lib/request-context";

const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

const ignoredPaths = new Set(["/health", "/health/live"]);
const ignoredPrefixes = ["/api/auth"];

export const shouldIgnore = (pathname: string) =>
  ignoredPaths.has(pathname) ||
  ignoredPrefixes.some((prefix) => pathname.startsWith(prefix));

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

export const logger = pino({
  level: getLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  transport:
    isProduction || isTest
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});

export const loggerPlugin = new Elysia({ name: "logger" })
  .derive({ as: "global" }, () => {
    const requestId = generateRequestId();
    enterRequestContext({ requestId });
    return { requestId, requestStart: performance.now() };
  })
  .onAfterHandle({ as: "global" }, ({ set, requestId }) => {
    set.headers["X-Request-ID"] = requestId;
  })
  .onError({ as: "global" }, ({ set, requestId }) => {
    set.headers["X-Request-ID"] = requestId;
  })
  .onAfterResponse({ as: "global" }, ({ request, requestStart, set }) => {
    const pathname = new URL(request.url).pathname;
    if (shouldIgnore(pathname)) {
      return;
    }

    const duration = Math.round(performance.now() - requestStart);
    const status = typeof set.status === "number" ? set.status : 200;

    logger.info(
      {
        method: request.method,
        path: pathname,
        status,
        duration: `${duration}ms`,
      },
      "request completed"
    );
  });
