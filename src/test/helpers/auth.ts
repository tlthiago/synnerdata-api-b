import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  members,
  organizationProfiles,
  organizations,
  users,
} from "@/db/schema";
import { createTestApp } from "./app";
import { waitForOTP } from "./otp";

type CreateTestUserOptions = {
  emailVerified?: boolean;
  withOrganization?: boolean;
};

type TestUserResult = {
  user: {
    id: string;
    email: string;
    name: string;
    emailVerified: boolean;
    organizationId?: string;
  };
  session: {
    id: string;
    token: string;
  };
  headers: Record<string, string>;
};

const SESSION_TOKEN_REGEX = /better-auth\.session_token=([^;]+)/;

/**
 * Creates a test user using Better Auth emailOTP flow to ensure valid session tokens
 */
export async function createTestUser(
  options: CreateTestUserOptions = {}
): Promise<TestUserResult> {
  const { emailVerified = true, withOrganization = true } = options;

  const testId = crypto.randomUUID();
  const email = `test-${testId}@example.com`;
  const name = `Test User ${testId.slice(0, 8)}`;

  const app = createTestApp();

  // Step 1: Send OTP to email
  const sendOtpResponse = await app.handle(
    new Request("http://localhost/auth/api/email-otp/send-verification-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        type: "sign-in",
      }),
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
    new Request("http://localhost/auth/api/sign-in/email-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        otp,
      }),
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
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!dbUser) {
    throw new Error("User not found in database after sign-in");
  }

  const userId = dbUser.id;

  // Update user name (emailOTP creates user without name)
  await db.update(users).set({ name }).where(eq(users.id, userId));

  // Update email verification if needed (emailOTP already sets it to true)
  if (!emailVerified) {
    await db
      .update(users)
      .set({ emailVerified: false })
      .where(eq(users.id, userId));
  }

  let organizationId: string | undefined;

  if (withOrganization) {
    organizationId = `test-org-${testId}`;
    const profileId = `test-profile-${testId}`;

    // Create organization
    await db.insert(organizations).values({
      id: organizationId,
      name: `Test Org ${testId.slice(0, 8)}`,
      slug: `test-org-${testId.slice(0, 8)}`,
      createdAt: new Date(),
    });

    // Create organization profile with all required fields
    await db.insert(organizationProfiles).values({
      id: profileId,
      organizationId,
      tradeName: `Test Company ${testId.slice(0, 8)}`,
      legalName: `Test Legal Name ${testId.slice(0, 8)}`,
      taxId: `test-${testId.slice(0, 14)}`,
      phone: "11999999999",
      mobile: "11999999999",
      email,
    });

    // Add user as owner of organization
    await db.insert(members).values({
      id: `test-member-${testId}`,
      organizationId,
      userId,
      role: "owner",
      createdAt: new Date(),
    });

    // Set the organization as active in the session
    const setActiveResponse = await app.handle(
      new Request("http://localhost/auth/api/organization/set-active", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `better-auth.session_token=${sessionToken}`,
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          organizationId,
        }),
      })
    );

    if (!setActiveResponse.ok) {
      const errorBody = await setActiveResponse.text();
      throw new Error(
        `Failed to set active organization (${setActiveResponse.status}): ${errorBody || "No response body"}`
      );
    }
  }

  // Get session from database
  const [dbSession] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    user: {
      id: userId,
      email,
      name,
      emailVerified,
      organizationId,
    },
    session: {
      id: dbSession?.id ?? "",
      token: sessionToken,
    },
    headers: {
      Cookie: `better-auth.session_token=${sessionToken}`,
    },
  };
}

/**
 * Extract session token from Set-Cookie header
 */
function extractSessionToken(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

  // Better Auth may set multiple cookies, find the session token
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
 * Creates authentication headers for a session token
 */
export function createAuthHeaders(
  sessionToken: string
): Record<string, string> {
  return {
    Cookie: `better-auth.session_token=${sessionToken}`,
  };
}

/**
 * Creates a test user without email verification
 */
export function createUnverifiedTestUser(): Promise<TestUserResult> {
  return createTestUser({ emailVerified: false });
}

/**
 * Creates a test user without an organization
 */
export function createTestUserWithoutOrg(): Promise<TestUserResult> {
  return createTestUser({ withOrganization: false });
}
