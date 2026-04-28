import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { openAPI } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { Session, User } from "better-auth/types";
import { localization } from "better-auth-localization";
import { db } from "@/db";
import { fullSchema } from "@/db/schema";
import { env, isTest } from "@/env";
import { handleWelcomeEmail } from "@/lib/auth/admin-helpers";
import {
  auditLogin,
  auditUserCreate,
  auditUserDelete,
} from "@/lib/auth/audit-helpers";
import {
  activateAdminProvisionOnLogin,
  activateProvisionOnPasswordReset,
  applyAdminRolesBeforeUserCreate,
  assignInitialActiveOrganizationId,
  onInvitationAccepted,
  onMemberAdded,
  onMemberRemoved,
  onMemberRoleUpdated,
  onOrganizationDeleted,
  onOrganizationUpdated,
  sendOrganizationInvitationForHook,
  sendPasswordResetForProvisionOrDefault,
  triggerAfterCreateOrganizationEffects,
  validateBeforeCreateInvitation,
  validateBeforeDeleteOrganization,
  validateCanCreateOrganization,
  validateUserBeforeDelete,
} from "@/lib/auth/hooks";
import { validateUniqueRole } from "@/lib/auth/validators";
import { parseOrigins } from "@/lib/cors";
import { AppError } from "@/lib/errors/base-error";
import { validatePasswordComplexity } from "./auth/password-complexity";
import { orgAc, orgRoles, systemAc, systemRoles } from "./auth/permissions";
import {
  sendTwoFactorOTPEmail,
  sendVerificationEmail as sendVerificationEmailFn,
} from "./emails/senders/auth";

const trustedOrigins = parseOrigins(env.CORS_ORIGIN);

// Extended types with organization plugin fields
export type AuthSession = Session & {
  activeOrganizationId: string | null;
};

export type AuthUser = User & {
  role: string;
};

export const auth = betterAuth({
  appName: "Synnerdata",
  basePath: "/api/auth",
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: fullSchema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendResetPassword: sendPasswordResetForProvisionOrDefault,
    onPasswordReset: ({ user }) => activateProvisionOnPasswordReset(user),
    revokeSessionsOnPasswordReset: true,
    password: {
      async hash(password) {
        validatePasswordComplexity(password);
        return await hashPassword(password);
      },
      verify: ({ password, hash }) => verifyPassword({ password, hash }),
    },
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      // Skip quando user já está verified (admins, super_admins e invitees
      // são criados com emailVerified: true em applyAdminRolesBeforeUserCreate)
      if (user.emailVerified) {
        return;
      }
      await sendVerificationEmailFn({ email: user.email, url });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async afterEmailVerification(user) {
      await handleWelcomeEmail(user);
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      async beforeDelete(user, request) {
        let orgIdToDelete: string | null;
        try {
          orgIdToDelete = await validateUserBeforeDelete(user as AuthUser);
        } catch (error) {
          if (error instanceof AppError) {
            throw new APIError("BAD_REQUEST", {
              code: error.code,
              message: error.message,
            });
          }
          throw error;
        }
        if (orgIdToDelete) {
          await auth.api.deleteOrganization({
            body: { organizationId: orgIdToDelete },
            headers: request?.headers ?? new Headers(),
          });
        }
      },
      async afterDelete(user) {
        await auditUserDelete(user);
      },
    },
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
  advanced: {
    useSecureCookies: !isTest,
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
  rateLimit: {
    enabled: !isTest,
    window: 60,
    max: 100,
    storage: "memory",
    customRules: {
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 3 },
      "/two-factor/*": { window: 60, max: 3 },
      "/forgot-password/*": { window: 300, max: 3 },
      "/send-verification-email": { window: 300, max: 3 },
      "/get-session": false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: applyAdminRolesBeforeUserCreate,
        after: async (user) => {
          await auditUserCreate(user);
        },
      },
    },
    session: {
      create: {
        before: assignInitialActiveOrganizationId,
        after: async (session) => {
          await auditLogin(session);
          await activateAdminProvisionOnLogin(session);
        },
      },
    },
  },
  plugins: [
    localization({
      defaultLocale: "pt-BR",
      fallbackLocale: "default",
    }),
    openAPI(),
    admin({
      ac: systemAc,
      roles: systemRoles,
      defaultRole: "user",
      adminRoles: ["super_admin", "admin"],
    }),
    organization({
      organizationLimit: 1,
      membershipLimit: 4,
      allowUserToCreateOrganization: validateCanCreateOrganization,
      ac: orgAc,
      roles: orgRoles,
      sendInvitationEmail: sendOrganizationInvitationForHook,
      organizationHooks: {
        beforeCreateInvitation: validateBeforeCreateInvitation,
        afterCreateOrganization: triggerAfterCreateOrganizationEffects,
        afterUpdateOrganization: onOrganizationUpdated,
        beforeDeleteOrganization: validateBeforeDeleteOrganization,
        afterDeleteOrganization: onOrganizationDeleted,
        afterAcceptInvitation: onInvitationAccepted,
        afterUpdateMemberRole: onMemberRoleUpdated,
        afterAddMember: onMemberAdded,
        afterRemoveMember: onMemberRemoved,
        beforeAddMember: async ({ member, organization: org }) => {
          await validateUniqueRole(member.role, org.id);
        },
        beforeRemoveMember: ({ member }) => {
          if (member.role === "owner") {
            throw new APIError("FORBIDDEN", {
              message: "O proprietário da organização não pode ser removido.",
            });
          }
          return Promise.resolve();
        },
      },
    }),
    twoFactor({
      otpOptions: {
        async sendOTP({ user, otp }) {
          await sendTwoFactorOTPEmail({ email: user.email, otp });
        },
        period: 5,
        digits: 6,
        allowedAttempts: 5,
        storeOTP: "encrypted",
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
        storeBackupCodes: "encrypted",
      },
    }),
    apiKey({
      enableMetadata: true,
      enableSessionForAPIKeys: true,
      apiKeyHeaders: ["x-api-key"],
      rateLimit: {
        enabled: !isTest,
        timeWindow: 60 * 1000,
        maxRequests: 200,
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
