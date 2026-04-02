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
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fullSchema, type Role, roleValues, schema } from "@/db/schema";
import { env } from "@/env";
import { parseOrigins } from "@/lib/cors";
import { logger } from "@/lib/logger";
import { AuditService } from "@/modules/audit/audit.service";
import { SubscriptionService } from "@/modules/payments/subscription/subscription.service";
import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmail,
  sendProvisionActivationEmail,
  sendTwoFactorOTPEmail,
  sendVerificationEmail as sendVerificationEmailFn,
  sendWelcomeEmail,
} from "./email";
import { validatePasswordComplexity } from "./password-complexity";
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

async function auditMemberRoleUpdate(params: {
  member: { id: string; userId: string };
  previousRole: string;
  newRole: string;
  organizationId: string;
  updatedByUserId: string;
}): Promise<void> {
  await AuditService.log({
    action: "update",
    resource: "member",
    resourceId: params.member.id,
    userId: params.updatedByUserId,
    organizationId: params.organizationId,
    changes: {
      before: { role: params.previousRole },
      after: { role: params.newRole },
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

async function validateUniqueRole(
  role: string,
  organizationId: string
): Promise<void> {
  const validRoles: readonly string[] = roleValues;
  if (!validRoles.includes(role)) {
    return;
  }

  const typedRole = role as Role;

  const existingMember = await db.query.members.findFirst({
    where: and(
      eq(schema.members.organizationId, organizationId),
      eq(schema.members.role, typedRole)
    ),
  });

  if (existingMember) {
    throw new APIError("BAD_REQUEST", {
      code: "ROLE_ALREADY_ASSIGNED",
      message: `A role "${role}" já está atribuída a um membro desta organização.`,
    });
  }

  const pendingInvitation = await db.query.invitations.findFirst({
    where: and(
      eq(schema.invitations.organizationId, organizationId),
      eq(schema.invitations.role, typedRole),
      eq(schema.invitations.status, "pending")
    ),
  });

  if (pendingInvitation) {
    throw new APIError("BAD_REQUEST", {
      code: "ROLE_INVITATION_PENDING",
      message: `Já existe um convite pendente para a role "${role}" nesta organização.`,
    });
  }
}

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
    async sendResetPassword({ user, url }) {
      const provision = await db.query.adminOrgProvisions?.findFirst({
        where: and(
          eq(schema.adminOrgProvisions.userId, user.id),
          eq(schema.adminOrgProvisions.status, "pending_activation")
        ),
      });

      if (provision) {
        // Extract token from Better Auth URL (/api/auth/reset-password/<TOKEN>)
        const parsedUrl = new URL(url);
        const segments = parsedUrl.pathname.split("/");
        const resetIndex = segments.indexOf("reset-password");
        const token = resetIndex !== -1 ? segments[resetIndex + 1] : null;

        if (!token) {
          logger.error({
            type: "admin-provision:activation:token-extraction-failed",
            url,
            userId: user.id,
          });
          return;
        }

        const encodedEmail = encodeURIComponent(user.email);
        const activationUrl = `${env.APP_URL}/definir-senha?token=${token}&email=${encodedEmail}`;

        // Fetch organization name for personalized email
        const [org] = await db
          .select({ name: schema.organizations.name })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, provision.organizationId))
          .limit(1);

        await sendProvisionActivationEmail({
          email: user.email,
          url: activationUrl,
          userName: user.name,
          organizationName: org?.name ?? "sua organização",
          isTrial: provision.type === "trial",
        });
        await db
          .update(schema.adminOrgProvisions)
          .set({ activationUrl, activationSentAt: new Date() })
          .where(eq(schema.adminOrgProvisions.id, provision.id));
      } else {
        await sendPasswordResetEmail({ email: user.email, url });
      }
    },
    async onPasswordReset({ user }) {
      const provision = await db.query.adminOrgProvisions?.findFirst({
        where: and(
          eq(schema.adminOrgProvisions.userId, user.id),
          eq(schema.adminOrgProvisions.status, "pending_activation")
        ),
      });

      if (!provision) {
        return;
      }

      await db
        .update(schema.users)
        .set({ emailVerified: true })
        .where(eq(schema.users.id, user.id));

      await db
        .update(schema.adminOrgProvisions)
        .set({ status: "active", activatedAt: new Date() })
        .where(eq(schema.adminOrgProvisions.id, provision.id));
    },
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
        // Block admin/super_admin from deleting their own account
        const userRole = (user as AuthUser).role;
        if (userRole === "admin" || userRole === "super_admin") {
          throw new APIError("BAD_REQUEST", {
            code: "ADMIN_ACCOUNT_DELETE_FORBIDDEN",
            message:
              "Contas de administrador não podem ser excluídas por esta ação.",
          });
        }

        const membership = await db.query.members.findFirst({
          where: eq(schema.members.userId, user.id),
        });

        if (!membership) {
          return;
        }

        if (membership.role !== "owner") {
          return;
        }

        // Validate: no active paid subscription
        const access = await SubscriptionService.checkAccess(
          membership.organizationId
        );
        const paidStatuses: string[] = ["active", "past_due"];
        if (access.hasAccess && paidStatuses.includes(access.status)) {
          throw new APIError("BAD_REQUEST", {
            code: "ACTIVE_SUBSCRIPTION",
            message:
              "Não é possível excluir sua conta com uma assinatura ativa. Cancele a assinatura primeiro.",
          });
        }

        // Validate: no other members besides owner
        const members = await db.query.members.findMany({
          where: eq(schema.members.organizationId, membership.organizationId),
        });
        const otherMembers = members.filter((m) => m.userId !== user.id);
        if (otherMembers.length > 0) {
          throw new APIError("BAD_REQUEST", {
            code: "ORGANIZATION_HAS_MEMBERS",
            message:
              "Não é possível excluir sua conta. Remova os outros membros da organização primeiro.",
          });
        }

        // Delete organization via Better Auth API (triggers existing org hooks)
        await auth.api.deleteOrganization({
          body: { organizationId: membership.organizationId },
          headers: request?.headers,
        });
      },
      async afterDelete(user) {
        await AuditService.log({
          action: "delete",
          resource: "user",
          resourceId: user.id,
          userId: user.id,
          changes: { before: { id: user.id, email: user.email } },
        });
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
      "/get-session": false,
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const { superAdmins, admins } = getAdminEmails();

          if (superAdmins.includes(user.email)) {
            return {
              data: {
                ...user,
                role: "super_admin",
                emailVerified: true,
              },
            };
          }

          if (admins.includes(user.email)) {
            return {
              data: {
                ...user,
                role: "admin",
                emailVerified: true,
              },
            };
          }

          const pendingInvitation = await db.query.invitations.findFirst({
            where: and(
              eq(schema.invitations.email, user.email),
              eq(schema.invitations.status, "pending")
            ),
          });

          if (pendingInvitation) {
            return { data: { ...user, emailVerified: true } };
          }

          return { data: user };
        },
        after: async (user) => {
          await auditUserCreate(user);
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

          // Mark admin-provisioned account as active on first login
          await db
            .update(schema.adminOrgProvisions)
            .set({ status: "active", activatedAt: new Date() })
            .where(
              and(
                eq(schema.adminOrgProvisions.userId, session.userId),
                eq(schema.adminOrgProvisions.status, "pending_activation")
              )
            )
            .catch(() => {
              // Silently ignore — should not affect normal login flow
            });
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
      allowUserToCreateOrganization: async (
        user: User & Record<string, unknown>
      ) => {
        if (user.role !== "user") {
          return false;
        }

        const existingMembership = await db.query.members.findFirst({
          where: eq(schema.members.userId, user.id),
        });
        if (existingMembership) {
          return false;
        }

        const pendingInvitation = await db.query.invitations.findFirst({
          where: and(
            eq(schema.invitations.email, user.email),
            eq(schema.invitations.status, "pending")
          ),
        });
        if (pendingInvitation) {
          return false;
        }

        return true;
      },
      ac: orgAc,
      roles: orgRoles,
      async sendInvitationEmail(data: {
        id: string;
        email: string;
        role: string | string[];
        inviter: { user: { name: string; email: string } };
        organization: { name: string };
      }) {
        const inviteLink = `${env.APP_URL}/convite/${data.id}?email=${encodeURIComponent(data.email)}`;
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
        beforeCreateInvitation: async ({
          invitation,
          organization: org,
        }: {
          invitation: { role: string; email: string };
          organization: Organization;
        }) => {
          const validRoles = roleValues as readonly string[];
          if (!validRoles.includes(invitation.role)) {
            throw new APIError("BAD_REQUEST", {
              code: "INVALID_ORGANIZATION_ROLE",
              message: `Role inválida: "${invitation.role}". Roles válidas: ${roleValues.join(", ")}`,
            });
          }

          await validateUniqueRole(invitation.role, org.id);

          const existingUser = await db.query.users.findFirst({
            where: eq(schema.users.email, invitation.email),
          });

          if (existingUser) {
            throw new APIError("BAD_REQUEST", {
              code: "USER_ALREADY_EXISTS",
              message:
                "Este email já possui uma conta na plataforma. Convites só podem ser enviados para novos usuários.",
            });
          }
        },
        afterCreateOrganization: async ({
          organization: org,
          member,
        }: {
          organization: Organization;
          member: { userId: string };
        }) => {
          const { OrganizationService } = await import(
            "@/modules/organizations/profile/organization.service"
          );

          await SubscriptionService.createTrial(org.id);

          OrganizationService.createMinimalProfile(org.id, org.name).catch(
            (error) => {
              logger.error({
                type: "organization:auto-profile:failed",
                organizationId: org.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          );

          auditOrganizationCreate(org, member.userId).catch((error) => {
            logger.error({
              type: "audit:organization-create:failed",
              organizationId: org.id,
              userId: member.userId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
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
        beforeDeleteOrganization: async ({
          organization: org,
        }: {
          organization: Organization;
          user: User;
        }) => {
          const activeMembers = await db.query.members.findMany({
            where: eq(schema.members.organizationId, org.id),
          });

          const nonOwnerMembers = activeMembers.filter(
            (m) => m.role !== "owner"
          );

          if (nonOwnerMembers.length > 0) {
            throw new APIError("BAD_REQUEST", {
              code: "ORGANIZATION_HAS_ACTIVE_MEMBERS",
              message: `Não é possível excluir a organização. Existem ${nonOwnerMembers.length} membro(s) ativo(s) que devem ser removidos primeiro.`,
            });
          }

          const access = await SubscriptionService.checkAccess(org.id);
          const paidStatuses: string[] = ["active", "past_due"];
          if (access.hasAccess && paidStatuses.includes(access.status)) {
            throw new APIError("BAD_REQUEST", {
              code: "ORGANIZATION_HAS_ACTIVE_SUBSCRIPTION",
              message:
                "Não é possível excluir a organização com assinatura ativa. Cancele a assinatura primeiro.",
            });
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
