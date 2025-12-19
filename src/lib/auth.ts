import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Organization } from "better-auth/plugins";
import {
  admin,
  apiKey,
  emailOTP,
  openAPI,
  organization,
} from "better-auth/plugins";
import type { Session, User } from "better-auth/types";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fullSchema, schema } from "@/db/schema";
import { env } from "@/env";
import { parseOrigins } from "@/lib/cors";
import { logger } from "@/lib/logger";
import { AuditService } from "@/modules/audit/audit.service";
import { PlanService } from "@/modules/payments/plan/plan.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { sendOTPEmail, sendWelcomeEmail } from "./email";
import { orgAc, orgRoles, systemAc, systemRoles } from "./permissions";

const isTest = process.env.NODE_ENV === "test";
const trustedOrigins = parseOrigins(env.CORS_ORIGIN);

// Extended types with organization plugin fields
export type AuthSession = Session & {
  activeOrganizationId: string | null;
};

export type AuthUser = User & {
  role: string;
};

const DEFAULT_TRIAL_PLAN_NAME = "platinum";

function getAdminEmails(): { superAdmins: string[]; admins: string[] } {
  const superAdmins = env.SUPER_ADMIN_EMAILS.split(",").filter(Boolean);
  const admins = env.ADMIN_EMAILS.split(",").filter(Boolean);
  return { superAdmins, admins };
}

async function handleWelcomeEmail(user: {
  email: string;
  name: string;
}): Promise<void> {
  try {
    await sendWelcomeEmail({
      to: user.email,
      userName: user.name,
    });
  } catch (error) {
    logger.error({
      type: "email:welcome:failed",
      email: user.email,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function auditUserCreate(user: {
  id: string;
  email: string;
}): Promise<void> {
  await AuditService.log({
    action: "create",
    resource: "user",
    resourceId: user.id,
    userId: user.id,
    changes: { after: { id: user.id, email: user.email } },
  });
}

async function auditLogin(session: {
  id: string;
  userId: string;
  activeOrganizationId?: string | null;
}): Promise<void> {
  await AuditService.log({
    action: "login",
    resource: "session",
    resourceId: session.id,
    userId: session.userId,
    organizationId: session.activeOrganizationId ?? null,
  });
}

async function auditOrganizationCreate(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log({
    action: "create",
    resource: "organization",
    resourceId: org.id,
    userId,
    organizationId: org.id,
    changes: { after: { id: org.id, name: org.name } },
  });
}

export const auth = betterAuth({
  basePath: "/api/auth",
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: fullSchema,
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
        input: false,
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  rateLimit: {
    enabled: !isTest,
    window: 60,
    max: 100,
    storage: "memory",
    customRules: {
      "/sign-in/*": { window: 900, max: 5 },
      "/sign-up/*": { window: 60, max: 3 },
      "/two-factor/*": { window: 60, max: 3 },
      "/forgot-password/*": { window: 300, max: 3 },
      "/email-otp/*": { window: 60, max: 5 },
      "/get-session": false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: (user) => {
          const { superAdmins, admins } = getAdminEmails();

          if (superAdmins.includes(user.email)) {
            return Promise.resolve({
              data: {
                ...user,
                role: "super_admin",
                emailVerified: true,
              },
            });
          }

          if (admins.includes(user.email)) {
            return Promise.resolve({
              data: {
                ...user,
                role: "admin",
                emailVerified: true,
              },
            });
          }

          return Promise.resolve({ data: user });
        },
        after: async (user) => {
          await Promise.all([handleWelcomeEmail(user), auditUserCreate(user)]);
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const membership = await db.query.members.findFirst({
            where: eq(schema.members.userId, session.userId),
            orderBy: (m, { asc }) => [asc(m.createdAt)],
          });

          return {
            data: {
              ...session,
              activeOrganizationId: membership?.organizationId ?? null,
            },
          };
        },
        after: async (session) => {
          await auditLogin(session);
        },
      },
    },
  },
  plugins: [
    openAPI(),
    admin({
      ac: systemAc,
      roles: systemRoles,
      defaultRole: "user",
      adminRoles: ["super_admin", "admin"],
    }),
    organization({
      ac: orgAc,
      roles: orgRoles,
      organizationHooks: {
        afterCreateOrganization: async ({
          organization: org,
          member,
        }: {
          organization: Organization;
          member: { userId: string };
        }) => {
          const plan = await PlanService.getByName(DEFAULT_TRIAL_PLAN_NAME);
          await Promise.all([
            plan
              ? SubscriptionService.createTrial(org.id, plan.id)
              : Promise.resolve(),
            auditOrganizationCreate(org, member.userId),
          ]);
        },
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      disableSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        await sendOTPEmail({ email, otp, type });
      },
    }),
    apiKey({
      enableMetadata: true,
      enableSessionForAPIKeys: true,
      apiKeyHeaders: ["x-api-key"],
      rateLimit: {
        enabled: !isTest,
        timeWindow: 60 * 1000,
        maxRequests: 100,
      },
      permissions: {
        defaultPermissions: {
          employees: ["read"],
          occurrences: ["read"],
          organizations: ["read"],
          reports: ["read"],
        },
      },
    }),
  ],
});
