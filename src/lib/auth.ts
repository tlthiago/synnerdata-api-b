import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Organization } from "better-auth/plugins";
import { admin, emailOTP, openAPI, organization } from "better-auth/plugins";
import type { Session, User } from "better-auth/types";
import { eq } from "drizzle-orm";
import { fullSchema, schema } from "@/db/schema";
import { env } from "@/env";
import { PlanService } from "@/modules/payments/plan/plan.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import { db } from "../db";
import { sendOTPEmail, sendWelcomeEmail } from "./email";
import { orgAc, orgRoles, systemAc, systemRoles } from "./permissions";

// Extended types with organization plugin fields
export type AuthSession = Session & {
  activeOrganizationId: string | null;
};

export type AuthUser = User & {
  role: string;
};

const DEFAULT_TRIAL_PLAN_NAME = "starter";

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
    console.error("Failed to send welcome email:", error);
  }
}

export const auth = betterAuth({
  basePath: "/auth/api",
  trustedOrigins: [env.CORS_ORIGIN],
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
          await handleWelcomeEmail(user);
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
        }: {
          organization: Organization;
        }) => {
          const plan = await PlanService.getByName(DEFAULT_TRIAL_PLAN_NAME);
          if (plan) {
            await SubscriptionService.createTrial(org.id, plan.id);
          }
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
  ],
});
