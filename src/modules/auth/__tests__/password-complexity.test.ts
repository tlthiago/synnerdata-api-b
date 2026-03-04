import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import {
  clearMailbox,
  waitForPasswordResetEmail,
  waitForVerificationEmail,
} from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const STRONG_PASSWORD = "StrongPass123!";

const WEAK_PASSWORDS = [
  { label: "sem maiúscula", password: "weakpass123!" },
  { label: "sem minúscula", password: "WEAKPASS123!" },
  { label: "sem número", password: "WeakPassword!" },
  { label: "sem caractere especial", password: "WeakPassword123" },
] as const;

describe("Password Complexity Validation", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("Sign-up: rejeitar senhas fracas", () => {
    for (const { label, password } of WEAK_PASSWORDS) {
      test(`should reject sign-up with weak password (${label})`, async () => {
        const email = `complexity-signup-${crypto.randomUUID()}@example.com`;

        const response = await app.handle(
          new Request(`${BASE_URL}/api/auth/sign-up/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              password,
              name: "Complexity Test User",
            }),
          })
        );

        expect(response.status).not.toBe(200);

        const body = await response.json();
        expect(body.code).toBe("PASSWORD_TOO_WEAK");
      });
    }

    test("should accept sign-up with strong password", async () => {
      const email = `complexity-strong-${crypto.randomUUID()}@example.com`;

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password: STRONG_PASSWORD,
            name: "Strong Pass User",
          }),
        })
      );

      expect(response.status).toBe(200);

      await clearMailbox(email);
    });
  });

  describe("Change-password: rejeitar senhas fracas", () => {
    let sessionCookies: string;
    let testEmail: string;

    beforeAll(async () => {
      testEmail = `complexity-change-${crypto.randomUUID()}@example.com`;

      // Sign up and verify email
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: STRONG_PASSWORD,
            name: "Change Pass User",
          }),
        })
      );

      const { verificationUrl } = await waitForVerificationEmail(testEmail);
      await app.handle(
        new Request(verificationUrl, { method: "GET", redirect: "manual" })
      );

      // Sign in to get session
      const signInResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: STRONG_PASSWORD,
          }),
        })
      );

      sessionCookies = signInResponse.headers.get("set-cookie") ?? "";
      await clearMailbox(testEmail);
    });

    for (const { label, password } of WEAK_PASSWORDS) {
      test(`should reject change-password with weak password (${label})`, async () => {
        const response = await app.handle(
          new Request(`${BASE_URL}/api/auth/change-password`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: sessionCookies,
            },
            body: JSON.stringify({
              currentPassword: STRONG_PASSWORD,
              newPassword: password,
            }),
          })
        );

        expect(response.status).not.toBe(200);

        const body = await response.json();
        expect(body.code).toBe("PASSWORD_TOO_WEAK");
      });
    }

    test("should accept change-password with strong password", async () => {
      const newStrongPassword = "NewStrong456!";

      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/change-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({
            currentPassword: STRONG_PASSWORD,
            newPassword: newStrongPassword,
          }),
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("Reset-password: rejeitar senhas fracas", () => {
    let resetToken: string;
    let testEmail: string;

    beforeAll(async () => {
      testEmail = `complexity-reset-${crypto.randomUUID()}@example.com`;

      // Sign up and verify email
      await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: STRONG_PASSWORD,
            name: "Reset Pass User",
          }),
        })
      );

      const { verificationUrl } = await waitForVerificationEmail(testEmail);
      await app.handle(
        new Request(verificationUrl, { method: "GET", redirect: "manual" })
      );
      await clearMailbox(testEmail);

      // Request password reset
      await app.handle(
        new Request(`${BASE_URL}/api/auth/request-password-reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            redirectTo: `${env.APP_URL}/reset-password`,
          }),
        })
      );

      // Get reset token from email
      const { resetUrl } = await waitForPasswordResetEmail(testEmail);
      const callbackResponse = await app.handle(
        new Request(resetUrl, { method: "GET", redirect: "manual" })
      );

      const location = callbackResponse.headers.get("location") ?? "";
      const redirectUrl = new URL(location);
      resetToken = redirectUrl.searchParams.get("token") ?? "";
    });

    test("should have a valid reset token", () => {
      expect(resetToken).toBeTruthy();
    });

    test("should reject reset-password with weak password (sem maiúscula)", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPassword: "weakpass123!",
            token: resetToken,
          }),
        })
      );

      expect(response.status).not.toBe(200);

      const body = await response.json();
      expect(body.code).toBe("PASSWORD_TOO_WEAK");
    });

    test("should accept reset-password with strong password", async () => {
      // Need a fresh token since the previous one may still be valid
      // (Better Auth tokens are single-use only on success)
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newPassword: "NewReset789!",
            token: resetToken,
          }),
        })
      );

      expect(response.status).toBe(200);
    });

    test("should sign in with new password after reset", async () => {
      const response = await app.handle(
        new Request(`${BASE_URL}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: testEmail,
            password: "NewReset789!",
          }),
        })
      );

      expect(response.status).toBe(200);
    });
  });
});
