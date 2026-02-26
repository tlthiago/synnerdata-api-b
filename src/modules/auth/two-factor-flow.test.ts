import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/support/app";
import {
  clearMailbox,
  waitForOTP,
  waitForVerificationEmail,
} from "@/test/support/mailhog";

const BASE_URL = env.API_URL;
const TEST_PASSWORD = "TwoFactor123!";

// ============================================================
// TOTP Generation Helper (bitwise ops required by RFC 4226)
// ============================================================

function base32Decode(encoded: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of encoded.toUpperCase()) {
    const val = alphabet.indexOf(ch);
    if (val === -1) {
      continue;
    }
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(bits.substring(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

function truncateHMAC(hmac: Uint8Array, digits: number): number {
  // biome-ignore lint/suspicious/noBitwiseOperators: RFC 4226 offset extraction
  const offset = (hmac.at(-1) ?? 0) & 0x0f;
  const view = new DataView(hmac.buffer, hmac.byteOffset + offset, 4);
  const raw = view.getUint32(0) % 2_147_483_648; // Clear MSB (equivalent to & 0x7FFFFFFF)
  return raw % 10 ** digits;
}

async function generateTOTP(
  secretBase32: string,
  period = 30,
  digits = 6
): Promise<string> {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(4, counter, false);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, counterBytes);
  const hmac = new Uint8Array(sig);
  const code = truncateHMAC(hmac, digits);
  return String(code).padStart(digits, "0");
}

// ============================================================
// Cookie Helper
// ============================================================

const SET_COOKIE_SPLIT_REGEX = /, (?=[a-zA-Z_.-]+=)/;

/**
 * Parses a set-cookie header into a Cookie header string.
 * Handles multiple cookies, respects Max-Age=0 (deletion).
 */
function parseCookieHeader(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    return "";
  }

  const cookies: Record<string, string> = {};

  for (const part of setCookieHeader.split(SET_COOKIE_SPLIT_REGEX)) {
    const [nameValue] = part.split(";");
    const eqIndex = nameValue.indexOf("=");
    const name = nameValue.substring(0, eqIndex).trim();
    const value = nameValue.substring(eqIndex + 1).trim();

    if (part.includes("Max-Age=0") || value === "") {
      delete cookies[name];
    } else {
      cookies[name] = value;
    }
  }

  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

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

    // Clear verification emails so they don't interfere with OTP detection
    await clearMailbox(testEmail);

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

    sessionCookies = parseCookieHeader(
      signInResponse.headers.get("set-cookie")
    );
  });

  describe("Enable 2FA", () => {
    test("should enable 2FA and verify TOTP", async () => {
      // Step 1: Enable 2FA
      const enableResponse = await app.handle(
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

      expect(enableResponse.status).toBe(200);

      const enableBody = await enableResponse.json();
      expect(enableBody.totpURI).toBeDefined();
      expect(enableBody.backupCodes).toBeArray();
      expect(enableBody.backupCodes.length).toBe(10);
      backupCodes = enableBody.backupCodes;

      // Step 2: Extract TOTP secret and generate code
      const totpUrl = new URL(enableBody.totpURI);
      const secret = totpUrl.searchParams.get("secret");
      expect(secret).toBeTruthy();

      const totpCode = await generateTOTP(secret ?? "");

      // Step 3: Verify TOTP to complete 2FA setup
      const verifyResponse = await app.handle(
        new Request(`${BASE_URL}/api/auth/two-factor/verify-totp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookies,
          },
          body: JSON.stringify({ code: totpCode }),
        })
      );

      expect(verifyResponse.status).toBe(200);
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

      // Parse the 2FA cookies (includes better-auth.two_factor)
      sessionCookies = parseCookieHeader(
        signInResponse.headers.get("set-cookie")
      );
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

      sessionCookies = parseCookieHeader(response.headers.get("set-cookie"));
      expect(sessionCookies).toContain("better-auth.session_token");
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

      const tempCookies = parseCookieHeader(
        signInResponse.headers.get("set-cookie")
      );

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

      sessionCookies = parseCookieHeader(response.headers.get("set-cookie"));
      expect(sessionCookies).toContain("better-auth.session_token");
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

      const tempCookies = parseCookieHeader(
        signInResponse.headers.get("set-cookie")
      );

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

      const tempCookies = parseCookieHeader(
        signInResponse.headers.get("set-cookie")
      );

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

      sessionCookies = parseCookieHeader(
        verifyResponse.headers.get("set-cookie")
      );

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
