import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import { waitForOTP, waitForVerificationEmail } from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TwoFactor123!";

describe("Two-Factor Authentication Flow", () => {
  let app: TestApp;
  let testEmail: string;
  let sessionCookies: string;
  let backupCodes: string[];

  beforeAll(async () => {
    app = createTestApp();
    testEmail = `2fa-${crypto.randomUUID()}@example.com`;

    // Create, verify, and sign in user
    await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: TEST_PASSWORD,
          name: "2FA Test User",
        }),
      })
    );

    const { verificationUrl } = await waitForVerificationEmail(testEmail);
    await app.handle(
      new Request(verificationUrl, { method: "GET", redirect: "manual" })
    );

    const signInResponse = await app.handle(
      new Request(`${BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: TEST_PASSWORD,
        }),
      })
    );

    sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
  });

  describe("Enable 2FA", () => {
    test("should enable 2FA with password", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/enable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.backupCodes).toBeDefined();
      expect(body.backupCodes).toBeArray();
      expect(body.backupCodes.length).toBe(10);
      backupCodes = body.backupCodes;
    });
  });

  describe("Sign in with 2FA", () => {
    test("should require 2FA on sign in", async () => {
      // Sign out first
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(signInResponse.status).toBe(200);

      const body = await signInResponse.json();
      expect(body.twoFactorRedirect).toBe(true);

      // Save the temporary 2FA cookie
      sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
    });

    test("should send OTP email for 2FA", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/send-otp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
        })
      );

      expect(response.status).toBe(200);
    });

    test("should verify OTP and complete sign-in", async () => {
      const otp = await waitForOTP(testEmail);

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-otp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({ code: otp }),
        })
      );

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toContain("better-auth.session_token");
      sessionCookies = setCookieHeader ?? "";
    });

    test("should have active session after 2FA", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/get-session`, {
          method: "GET",
          headers: { Cookie: sessionCookies },
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.user.email).toBe(testEmail);
    });
  });

  describe("Backup Codes", () => {
    test("should sign in with backup code", async () => {
      // Sign out
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      // Sign in (triggers 2FA)
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      const tempCookies = signInResponse.headers.get("set-cookie") ?? "";

      // Use backup code
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-backup-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: tempCookies,
          },
          body: JSON.stringify({ code: backupCodes[0] }),
        })
      );

      expect(response.status).toBe(200);

      const setCookieHeader = response.headers.get("set-cookie");
      expect(setCookieHeader).toContain("better-auth.session_token");
      sessionCookies = setCookieHeader ?? "";
    });

    test("should reject already-used backup code", async () => {
      // Sign out
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      // Sign in (triggers 2FA)
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      const tempCookies = signInResponse.headers.get("set-cookie") ?? "";

      // Try to reuse the same backup code
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-backup-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: tempCookies,
          },
          body: JSON.stringify({ code: backupCodes[0] }),
        })
      );

      expect(response.status).not.toBe(200);
    });
  });

  describe("Disable 2FA", () => {
    test("should disable 2FA with password", async () => {
      // First complete 2FA sign-in to get a valid session
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      const tempCookies = signInResponse.headers.get("set-cookie") ?? "";

      // Use backup code to complete 2FA
      const verifyResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-backup-code`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: tempCookies,
          },
          body: JSON.stringify({ code: backupCodes[1] }),
        })
      );

      sessionCookies = verifyResponse.headers.get("set-cookie") ?? "";

      // Disable 2FA
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/disable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);
    });

    test("should sign in without 2FA after disabling", async () => {
      // Sign out
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { Cookie: sessionCookies },
        })
      );

      // Sign in should succeed without 2FA
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: TEST_PASSWORD,
          }),
        })
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.twoFactorRedirect).toBeFalsy();
    });
  });
});
