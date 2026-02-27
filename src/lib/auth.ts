import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import type { Invitation, Member, Organization } from "better-auth/plugins";
import {
  admin,
  apiKey,
  openAPI,
  organization,
  twoFactor,
} from "better-auth/plugins";
import type { Session, User } from "better-auth/types";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fullSchema, roleValues, schema } from "@/db/schema";
import { env } from "@/env";
import { parseOrigins } from "@/lib/cors";
import { logger } from "@/lib/logger";
import { AuditService } from "@/modules/audit/audit.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendTwoFactorOTPEmail,
  sendVerificationEmail as sendVerificationEmailFn,
  sendWelcomeEmail,
} from "./email";
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

async function auditOrganizationUpdate(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log({
    action: "update",
    resource: "organization",
    resourceId: org.id,
    userId,
    organizationId: org.id,
    changes: { after: { id: org.id, name: org.name } },
  });
}

async function auditOrganizationDelete(
  org: { id: string; name: string },
  userId: string
): Promise<void> {
  await AuditService.log({
    action: "delete",
    resource: "organization",
    resourceId: org.id,
    userId,
    organizationId: org.id,
    changes: { before: { id: org.id, name: org.name } },
  });
}

async function auditMemberAdd(
  member: { id: string; userId: string; role: string },
  organizationId: string,
  addedByUserId: string
): Promise<void> {
  await AuditService.log({
    action: "create",
    resource: "member",
    resourceId: member.id,
    userId: addedByUserId,
    organizationId,
    changes: {
      after: {
        id: member.id,
        userId: member.userId,
        role: member.role,
      },
    },
  });
}

async function auditMemberRemove(
  member: { id: string; userId: string; role: string },
  organizationId: string,
  removedByUserId: string
): Promise<void> {
  await AuditService.log({
    action: "delete",
    resource: "member",
    resourceId: member.id,
    userId: removedByUserId,
    organizationId,
    changes: {
      before: {
        id: member.id,
        userId: member.userId,
        role: member.role,
      },
    },
  });
}

async function auditInvitationAccept(
  invitation: { id: string; email: string; role: string },
  member: { id: string; userId: string },
  organizationId: string
): Promise<void> {
  await AuditService.log({
    action: "accept",
    resource: "invitation",
    resourceId: invitation.id,
    userId: member.userId,
    organizationId,
    changes: {
      after: {
        invitationId: invitation.id,
        email: invitation.email,
        role: invitation.role,
        memberId: member.id,
      },
    },
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
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({ email: user.email, url });
    },
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    async sendVerificationEmail({ user, url }) {
      await sendVerificationEmailFn({ email: user.email, url });
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async afterEmailVerification(user) {
      await handleWelcomeEmail(user);
    },
  },
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
      "/sign-in/*": { window: 60, max: 5 },
      "/sign-up/*": { window: 60, max: 3 },
      "/two-factor/*": { window: 60, max: 3 },
      "/forgot-password/*": { window: 300, max: 3 },
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
          const tasks: Promise<void>[] = [auditUserCreate(user)];
          if (user.emailVerified) {
            tasks.push(handleWelcomeEmail(user));
          }
          await Promise.all(tasks);
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
      async sendInvitationEmail(data: {
        id: string;
        email: string;
        role: string | string[];
        inviter: { user: { name: string; email: string } };
        organization: { name: string };
      }) {
        const inviteLink = `${env.APP_URL}/convite/${data.id}`;
        await sendOrganizationInvitationEmail({
          to: data.email,
          inviterName: data.inviter.user.name,
          inviterEmail: data.inviter.user.email,
          organizationName: data.organization.name,
          inviteLink,
          role: Array.isArray(data.role) ? data.role.join(", ") : data.role,
        });
      },
      organizationHooks: {
        beforeCreateInvitation: ({
          invitation,
        }: {
          invitation: { role: string };
        }) => {
          const validRoles = roleValues as readonly string[];
          if (!validRoles.includes(invitation.role)) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_ORGANIZATION_ROLE",
              message: `Role inválida: "${invitation.role}". Roles válidas: ${roleValues.join(", ")}`,
            });
          }
          return Promise.resolve();
        },
        afterCreateOrganization: async ({
          organization: org,
          member,
        }: {
          organization: Organization;
          member: { userId: string };
        }) => {
          await Promise.all([
            SubscriptionService.createTrial(org.id),
            auditOrganizationCreate(org, member.userId),
          ]);
        },
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
