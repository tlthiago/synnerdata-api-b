import { env } from "@/env";

/**
 * Creates a Basic Auth header for Pagarme webhook authentication.
 */
export function createWebhookAuthHeader(): string {
  const credentials = `${env.PAGARME_WEBHOOK_USERNAME}:${env.PAGARME_WEBHOOK_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/**
 * Creates an invalid Basic Auth header for testing webhook rejection.
 */
export function createInvalidWebhookAuthHeader(): string {
  return "Basic aW52YWxpZDppbnZhbGlk"; // invalid:invalid
}

/**
 * Creates headers for authenticated API requests.
 */
export function createAuthHeaders(
  sessionCookie: string
): Record<string, string> {
  return {
    Cookie: sessionCookie,
  };
}

/**
 * Creates headers for JSON API requests with authentication.
 */
export function createJsonAuthHeaders(
  sessionCookie: string
): Record<string, string> {
  return {
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  };
}
