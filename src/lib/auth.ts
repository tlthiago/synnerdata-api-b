import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Organization } from "better-auth/plugins";
import { emailOTP, openAPI, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { members, schema } from "@/db/schema";
import { PlanService, SubscriptionService } from "@/modules/payments";
import { db } from "../db";
import { sendOTPEmail } from "./email";
import { ac, manager, owner, supervisor, viewer } from "./permissions";

const DEFAULT_TRIAL_PLAN_NAME = "starter";

export const auth = betterAuth({
  basePath: "/auth/api",
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Find user's first organization to set as active
          const membership = await db.query.members.findFirst({
            where: eq(members.userId, session.userId),
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
    organization({
      ac,
      roles: {
        owner,
        manager,
        supervisor,
        viewer,
      },
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
