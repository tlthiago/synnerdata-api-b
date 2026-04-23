import { init } from "@sentry/bun";
import { env, isProduction } from "@/env";
import { PII_FIELDS } from "@/modules/audit/pii-redaction";

const REDACTED = "[REDACTED]";
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "x-api-key",
  "x-auth-token",
]);

function redactHeaders(headers: { [key: string]: string }): {
  [key: string]: string;
} {
  const safe: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(headers)) {
    safe[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return safe;
}

function redactPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(redactPayload);
  }
  if (typeof payload === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      result[key] = PII_FIELDS.has(key) ? REDACTED : redactPayload(value);
    }
    return result;
  }
  return payload;
}

const dsn = env.SENTRY_DSN;

if (dsn) {
  init({
    dsn,
    environment: isProduction ? "production" : "preview",
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        event.request.headers = redactHeaders(event.request.headers);
      }
      if (event.request?.data !== undefined) {
        event.request.data = redactPayload(event.request.data);
      }
      return event;
    },
  });
}
