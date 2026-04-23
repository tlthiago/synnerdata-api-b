import { randomUUID } from "node:crypto";
import pino from "pino";
import { isProduction, isTest } from "@/env";
import { getRequestId } from "@/lib/request-context";

const ignoredPaths = new Set(["/health", "/health/live"]);
const ignoredPrefixes = ["/api/auth"];

export const shouldIgnore = (pathname: string) =>
  ignoredPaths.has(pathname) ||
  ignoredPrefixes.some((prefix) => pathname.startsWith(prefix));

export const generateRequestId = (): string => `req-${randomUUID()}`;

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
