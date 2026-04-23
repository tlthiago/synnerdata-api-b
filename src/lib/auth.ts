import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { apiKey, openAPI } from "better-auth/plugins";
import { admin } from "better-auth/plugins/admin";
import {
  type Invitation,
  type Member,
  type Organization,
  organization,
} from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { Session, User } from "better-auth/types";
import { localization } from "better-auth-localization";
import { db } from "@/db";
import { fullSchema } from "@/db/schema";
import { env, isTest } from "@/env";
import { handleWelcomeEmail } from "@/lib/auth/admin-helpers";
import {
  auditInvitationAccept,
  auditLogin,
  auditMemberAdd,
  auditMemberRemove,
  auditMemberRoleUpdate,
  auditOrganizationDelete,
  auditOrganizationUpdate,
  auditUserCreate,
  auditUserDelete,
} from "@/lib/auth/audit-helpers";
import {
  activateAdminProvisionOnLogin,
  activateProvisionOnPasswordReset,
  applyAdminRolesBeforeUserCreate,
  assignInitialActiveOrganizationId,
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
import {
  sendTwoFactorOTPEmail,
  sendVerificationEmail as sendVerificationEmailFn,
} from "./email";
import { validatePasswordComplexity } from "./password-complexity";
import { orgAc, orgRoles, systemAc, systemRoles } from "./permissions";

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
      // Admin/super_admin já são criados com emailVerified: true — não enviar
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
        const orgIdToDelete = await validateUserBeforeDelete(user as AuthUser);
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
        afterUpdateOrganization: async ({
          organization: org,
          user,
        }: {
          organization: Organization | null;
          user: User;
        }) => {
          if (org) {
            await auditOrganizationUpdate(org, user.id);
          }
        },
        beforeDeleteOrganization: validateBeforeDeleteOrganization,
        afterDeleteOrganization: async ({
          organization: org,
          user,
        }: {
          organization: Organization | null;
          user: User;
        }) => {
          if (org) {
            await auditOrganizationDelete(org, user.id);
          }
        },
        afterAcceptInvitation: async ({
          invitation,
          member,
          organization: org,
        }: {
          invitation: Invitation;
          member: Member;
          organization: Organization;
        }) => {
          await auditInvitationAccept(
            {
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
            },
            { id: member.id, userId: member.userId },
            org.id
          );
        },
        beforeRemoveMember: ({ member }: { member: Member }) => {
          if (member.role === "owner") {
            throw new APIError("FORBIDDEN", {
              message: "O proprietário da organização não pode ser removido.",
            });
          }
          return Promise.resolve();
        },
        afterUpdateMemberRole: async ({
          member,
          previousRole,
          user,
          organization: org,
        }: {
          member: Member;
          previousRole: string;
          user: User;
          organization: Organization;
        }) => {
          await auditMemberRoleUpdate({
            member: { id: member.id, userId: member.userId },
            previousRole,
            newRole: member.role,
            organizationId: org.id,
            updatedByUserId: user.id,
          });
        },
        beforeAddMember: async ({
          member,
          organization: org,
        }: {
          member: { role: string };
          organization: Organization;
        }) => {
          await validateUniqueRole(member.role, org.id);
        },
        afterAddMember: async ({
          member,
          user,
          organization: org,
        }: {
          member: Member;
          user: User;
          organization: Organization;
        }) => {
          await auditMemberAdd(
            { id: member.id, userId: member.userId, role: member.role },
            org.id,
            user.id
          );
        },
        afterRemoveMember: async ({
          member,
          user,
          organization: org,
        }: {
          member: Member;
          user: User;
          organization: Organization;
        }) => {
          await auditMemberRemove(
            { id: member.id, userId: member.userId, role: member.role },
            org.id,
            user.id
          );
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
