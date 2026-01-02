import { env } from "@/env";
import type { PagarmeWebhookPayload } from "@/modules/payments/pagarme/pagarme.types";
import {
  createInvalidWebhookAuthHeader,
  createWebhookAuthHeader,
} from "@/test/support/auth";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Builder for creating HTTP requests for testing.
 *
 * @example
 * // Create a GET request
 * const request = new RequestBuilder()
 *   .get("/v1/plans")
 *   .withAuth(sessionCookie)
 *   .build();
 *
 * // Create a POST request with JSON body
 * const request = new RequestBuilder()
 *   .post("/v1/payments/checkout")
 *   .withAuth(sessionCookie)
 *   .withJson({ planId: "plan-123" })
 *   .build();
 *
 * // Create a webhook request
 * const request = new RequestBuilder()
 *   .webhook("/v1/payments/webhook")
 *   .withWebhookPayload(payload)
 *   .build();
 */
export class RequestBuilder {
  private readonly baseUrl: string;
  private path = "/";
  private method: HttpMethod = "GET";
  private readonly headers: Record<string, string> = {};
  private body?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? env.API_URL;
  }

  /**
   * Sets the request to GET method
   */
  get(path: string): this {
    this.method = "GET";
    this.path = path;
    return this;
  }

  /**
   * Sets the request to POST method
   */
  post(path: string): this {
    this.method = "POST";
    this.path = path;
    return this;
  }

  /**
   * Sets the request to PUT method
   */
  put(path: string): this {
    this.method = "PUT";
    this.path = path;
    return this;
  }

  /**
   * Sets the request to PATCH method
   */
  patch(path: string): this {
    this.method = "PATCH";
    this.path = path;
    return this;
  }

  /**
   * Sets the request to DELETE method
   */
  delete(path: string): this {
    this.method = "DELETE";
    this.path = path;
    return this;
  }

  /**
   * Sets up a webhook request (POST with Basic Auth)
   */
  webhook(path: string): this {
    this.method = "POST";
    this.path = path;
    this.headers["Content-Type"] = "application/json";
    this.headers.Authorization = createWebhookAuthHeader();
    return this;
  }

  /**
   * Sets up an invalid webhook request (wrong Basic Auth)
   */
  invalidWebhook(path: string): this {
    this.method = "POST";
    this.path = path;
    this.headers["Content-Type"] = "application/json";
    this.headers.Authorization = createInvalidWebhookAuthHeader();
    return this;
  }

  /**
   * Adds session cookie authentication
   */
  withAuth(sessionCookie: string): this {
    this.headers.Cookie = sessionCookie;
    return this;
  }

  /**
   * Adds a custom header
   */
  withHeader(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }

  /**
   * Sets JSON body
   */
  withJson(data: unknown): this {
    this.headers["Content-Type"] = "application/json";
    this.body = JSON.stringify(data);
    return this;
  }

  /**
   * Sets webhook payload as body
   */
  withWebhookPayload(payload: PagarmeWebhookPayload): this {
    this.body = JSON.stringify(payload);
    return this;
  }

  /**
   * Sets raw body
   */
  withBody(body: string): this {
    this.body = body;
    return this;
  }

  /**
   * Builds the Request object
   */
  build(): Request {
    const url = `${this.baseUrl}${this.path}`;

    const init: RequestInit = {
      method: this.method,
      headers: this.headers,
    };

    if (this.body && this.method !== "GET") {
      init.body = this.body;
    }

    return new Request(url, init);
  }
}
