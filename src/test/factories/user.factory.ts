import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestApp } from "@/test/support/app";

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

type CreateUserOptions = {
  emailVerified?: boolean;
  name?: string;
};

type CreateAdminOptions = CreateUserOptions & {
  role?: "super_admin" | "admin";
};

type CreateWithOrgOptions = CreateUserOptions & {
  orgName?: string;
};

const SESSION_TOKEN_REGEX = /better-auth\.session_token=([^;]+)/;
const TEST_PASSWORD = "TestPassword123!";

// biome-ignore lint/complexity/noStaticOnlyClass: Factory pattern for test utilities
export abstract class UserFactory {
  static async create(
    options: CreateUserOptions = {}
  ): Promise<TestUserResult> {
    const { emailVerified = true } = options;

    const testId = crypto.randomUUID();
    const email = `test-${testId}@example.com`;
    const name = options.name ?? `Test User ${testId.slice(0, 8)}`;

    const app = createTestApp();

    // Step 1: Sign up with email and password
    const signUpResponse = await app.handle(
      new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: TEST_PASSWORD, name }),
      })
    );

    if (!signUpResponse.ok) {
      const errorBody = await signUpResponse.text();
      throw new Error(
        `Failed to sign up (${signUpResponse.status}): ${errorBody || "No response body"}`
      );
    }

    // Step 2: Always verify email in DB so sign-in works (requireEmailVerification is enabled)
    await db
      .update(schema.users)
      .set({ emailVerified: true })
      .where(eq(schema.users.email, email));

    // Step 3: Sign in with email and password
    const signInResponse = await app.handle(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: TEST_PASSWORD }),
      })
    );

    if (!signInResponse.ok) {
      const errorBody = await signInResponse.text();
      throw new Error(
        `Failed to sign in (${signInResponse.status}): ${errorBody || "No response body"}`
      );
    }

    const setCookieHeader = signInResponse.headers.get("set-cookie");
    const sessionToken = UserFactory.extractSessionToken(setCookieHeader);

    if (!sessionToken) {
      throw new Error("No session token in sign-in response");
    }

    const [dbUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!dbUser) {
      throw new Error("User not found in database after sign-in");
    }

    // Set emailVerified back to false if requested (after sign-in succeeded)
    if (!emailVerified) {
      await db
        .update(schema.users)
        .set({ emailVerified: false })
        .where(eq(schema.users.id, dbUser.id));
    }

    return {
      user: {
        id: dbUser.id,
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

  static createUnverified(): Promise<TestUserResult> {
    return UserFactory.create({ emailVerified: false });
  }

  static async createAdmin(
    options: CreateAdminOptions = {}
  ): Promise<TestUserResult> {
    const { role = "super_admin", ...userOptions } = options;

    const userResult = await UserFactory.create(userOptions);

    await db
      .update(schema.users)
      .set({ role })
      .where(eq(schema.users.id, userResult.user.id));

    return userResult;
  }

  static async createWithOrganization(
    options: CreateWithOrgOptions = {}
  ): Promise<TestUserResult & { organizationId: string; userId: string }> {
    const { OrganizationFactory } = await import("./organization.factory");

    const { orgName, ...userOptions } = options;

    const userResult = await UserFactory.create(userOptions);

    const organization = await OrganizationFactory.create({
      name: orgName,
      creatorUserId: userResult.user.id,
    });
    await OrganizationFactory.addMember(userResult, {
      organizationId: organization.id,
      role: "owner",
    });

    return {
      ...userResult,
      organizationId: organization.id,
      userId: userResult.user.id,
    };
  }

  static createAuthHeaders(sessionToken: string): Record<string, string> {
    return {
      Cookie: `better-auth.session_token=${sessionToken}`,
    };
  }

  private static extractSessionToken(
    setCookieHeader: string | null
  ): string | null {
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
}
