import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { waitForOTP } from "../support/mailhog";
import { createTestApp } from "./app";

export type TestUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

export type TestSession = {
  id: string;
  token: string;
};

export type TestUserResult = {
  user: TestUser;
  session: TestSession;
  headers: Record<string, string>;
  organizationId?: string;
};

type CreateTestUserOptions = {
  emailVerified?: boolean;
  name?: string;
};

const SESSION_TOKEN_REGEX = /better-auth\.session_token=([^;]+)/;

/**
 * Creates a test user using Better Auth emailOTP flow.
 * This creates ONLY the user with a valid session - no organization.
 */
export async function createTestUser(
  options: CreateTestUserOptions = {}
): Promise<TestUserResult> {
  const { emailVerified = true } = options;

  const testId = crypto.randomUUID();
  const email = `test-${testId}@example.com`;
  const name = options.name ?? `Test User ${testId.slice(0, 8)}`;

  const app = createTestApp();

  // Step 1: Send OTP to email
  const sendOtpResponse = await app.handle(
    new Request("http://localhost/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "sign-in" }),
    })
  );

  if (!sendOtpResponse.ok) {
    const errorBody = await sendOtpResponse.text();
    throw new Error(
      `Failed to send OTP (${sendOtpResponse.status}): ${errorBody || "No response body"}`
    );
  }

  // Step 2: Get OTP from database
  const otp = await waitForOTP(email);

  // Step 3: Sign in with OTP
  const signInResponse = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    })
  );

  if (!signInResponse.ok) {
    const errorBody = await signInResponse.text();
    throw new Error(
      `Failed to sign in with OTP (${signInResponse.status}): ${errorBody || "No response body"}`
    );
  }

  // Get session token from sign-in response cookies
  const setCookieHeader = signInResponse.headers.get("set-cookie");
  const sessionToken = extractSessionToken(setCookieHeader);

  if (!sessionToken) {
    throw new Error("No session token in sign-in response");
  }

  // Get user from database
  const [dbUser] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  if (!dbUser) {
    throw new Error("User not found in database after sign-in");
  }

  const userId = dbUser.id;

  // Update user name (emailOTP creates user without name)
  await db
    .update(schema.users)
    .set({ name })
    .where(eq(schema.users.id, userId));

  // Update email verification if needed
  if (!emailVerified) {
    await db
      .update(schema.users)
      .set({ emailVerified: false })
      .where(eq(schema.users.id, userId));
  }

  return {
    user: {
      id: userId,
      email,
      name,
      emailVerified,
    },
    session: {
      id: dbUser.id,
      token: sessionToken,
    },
    headers: {
      Cookie: `better-auth.session_token=${sessionToken}`,
    },
  };
}

/**
 * Creates a test user without email verification.
 */
export function createUnverifiedTestUser(): Promise<TestUserResult> {
  return createTestUser({ emailVerified: false });
}

/**
 * Extract session token from Set-Cookie header.
 */
function extractSessionToken(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

  const cookies = setCookieHeader.split(",").map((c) => c.trim());

  for (const cookie of cookies) {
    const match = cookie.match(SESSION_TOKEN_REGEX);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Creates authentication headers for a session token.
 */
export function createAuthHeaders(
  sessionToken: string
): Record<string, string> {
  return {
    Cookie: `better-auth.session_token=${sessionToken}`,
  };
}

type CreateTestUserWithOrgOptions = CreateTestUserOptions & {
  orgName?: string;
  skipTrialCreation?: boolean;
};

type CreateTestAdminUserOptions = CreateTestUserOptions & {
  role?: "super_admin" | "admin";
};

/**
 * Creates a test user with admin privileges.
 * This is used for testing admin-only endpoints (e.g., plan management).
 */
export async function createTestAdminUser(
  options: CreateTestAdminUserOptions = {}
): Promise<TestUserResult> {
  const { role = "super_admin", ...userOptions } = options;

  const userResult = await createTestUser(userOptions);

  // Update the user's role to the specified admin role
  await db
    .update(schema.users)
    .set({ role })
    .where(eq(schema.users.id, userResult.user.id));

  return userResult;
}

/**
 * Creates a test user with an organization.
 * This is the most common test scenario.
 */
export async function createTestUserWithOrganization(
  options: CreateTestUserWithOrgOptions = {}
): Promise<TestUserResult & { organizationId: string; userId: string }> {
  const {
    addMemberToOrganization,
    createTestOrganization,
  } = require("./organization");

  const { orgName, skipTrialCreation: _, ...userOptions } = options;

  const userResult = await createTestUser(userOptions);

  const organization = await createTestOrganization({ name: orgName });
  await addMemberToOrganization(userResult, {
    organizationId: organization.id,
    role: "owner",
  });

  return {
    ...userResult,
    organizationId: organization.id,
    userId: userResult.user.id,
  };
}
