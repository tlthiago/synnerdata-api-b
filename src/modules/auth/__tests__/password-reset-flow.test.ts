import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import {
  clearMailbox,
  waitForPasswordResetEmail,
  waitForVerificationEmail,
} from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const ORIGINAL_PASSWORD = "OriginalPassword123!";
const NEW_PASSWORD = "NewPassword456!";

describe("Password Reset Flow", () => {
  let app: TestApp;
  let testEmail: string;
  let resetToken: string;

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `reset-${crypto.randomUUID()}@example.com`;

    // Create and verify user
    await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: ORIGINAL_PASSWORD,
          name: "Reset Test User",
        }),
      })
    );

    const { verificationUrl } = await waitForVerificationEmail(testEmail);
    await app.handle(
      new Request(verificationUrl, { method: "GET", redirect: "manual" })
    );

    await clearMailbox(testEmail);
  });

  test("should request password reset", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          redirectTo: `${env.APP_URL}/reset-password`,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should send password reset email", async () => {
    const emailData = await waitForPasswordResetEmail(testEmail);
    expect(emailData.subject).toContain("Redefinir sua senha");
    expect(emailData.resetUrl).toBeTruthy();
  });

  test("should reset password with valid token", async () => {
    const { resetUrl } = await waitForPasswordResetEmail(testEmail);

    // Follow the reset callback URL to get the redirect with token
    const callbackResponse = await app.handle(
      new Request(resetUrl, { method: "GET", redirect: "manual" })
    );

    expect(callbackResponse.status).toBe(302);

    const location = callbackResponse.headers.get("location");
    expect(location).toBeTruthy();

    const redirectUrl = new URL(location ?? "");
    resetToken = redirectUrl.searchParams.get("token") ?? "";
    expect(resetToken).toBeTruthy();

    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: NEW_PASSWORD,
          token: resetToken,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should reject old password after reset", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: ORIGINAL_PASSWORD,
        }),
      })
    );

    expect(response.status).not.toBe(200);
  });

  test("should sign in with new password", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: NEW_PASSWORD,
        }),
      })
    );

    expect(response.status).toBe(200);

    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toContain("better-auth.session_token");
  });

  test("should return consistent message for non-existent email", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/api/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@example.com",
          redirectTo: `${env.APP_URL}/reset-password`,
        }),
      })
    );

    // Better Auth returns 200 even for non-existent email to prevent enumeration
    expect(response.status).toBe(200);
  });
});
