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

const PII_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  "*.password",
  "*.cpf",
  "*.rg",
  "*.pisPasep",
  "*.ctps",
  "*.salary",
  "*.hourlyRate",
  "*.birthDate",
  "*.cid",
  "body.card.*",
  "body.password",
  "body.cpf",
  "body.rg",
  "body.pisPasep",
  "body.ctps",
  "body.salary",
  "body.hourlyRate",
  "body.birthDate",
  "body.cid",
];

export const logger = pino({
  level: getLogLevel(),
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: PII_REDACT_PATHS,
    censor: "[REDACTED]",
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
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
