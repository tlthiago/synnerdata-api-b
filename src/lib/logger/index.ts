import { randomUUID } from "node:crypto";
import { Elysia } from "elysia";
import pino from "pino";
import { isProduction, isTest } from "@/env";
import { enterRequestContext, getRequestId } from "@/lib/request-context";

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
  .onRequest(({ set }) => {
    const requestId = generateRequestId();
    enterRequestContext({ requestId });
    set.headers["X-Request-ID"] = requestId;
  })
  .derive({ as: "global" }, () => ({
    requestId: getRequestId() as string,
    requestStart: performance.now(),
  }))
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
