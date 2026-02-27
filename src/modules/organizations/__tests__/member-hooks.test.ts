import { beforeAll, describe, expect, test } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { addMemberToOrganization } from "@/test/helpers/organization";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

describe("Organization member hooks", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("beforeRemoveMember", () => {
    test("should prevent removing the owner", async () => {
      const owner = await createTestUserWithOrganization();

      const [ownerMember] = await db
        .select()
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, owner.userId),
            eq(schema.members.organizationId, owner.organizationId)
          )
        )
        .limit(1);

      // Create a second owner to attempt the removal
      const secondUser = await createTestUser();
      await addMemberToOrganization(secondUser, {
        organizationId: owner.organizationId,
        role: "owner",
      });

      const response = await app.handle(
        new Request("http://localhost/api/auth/organization/remove-member", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...secondUser.headers,
          },
          body: JSON.stringify({
            memberIdOrEmail: ownerMember.id,
          }),
        })
      );

      expect(response.status).toBe(403);
    });

    test("should allow removing a non-owner member", async () => {
      const owner = await createTestUserWithOrganization();

      const viewer = await createTestUser();
      await addMemberToOrganization(viewer, {
        organizationId: owner.organizationId,
        role: "viewer",
      });

      const [viewerMember] = await db
        .select()
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, viewer.user.id),
            eq(schema.members.organizationId, owner.organizationId)
          )
        )
        .limit(1);

      const response = await app.handle(
        new Request("http://localhost/api/auth/organization/remove-member", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...owner.headers,
          },
          body: JSON.stringify({
            memberIdOrEmail: viewerMember.id,
          }),
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("afterUpdateMemberRole", () => {
    test("should allow owner to change another member's role", async () => {
      const owner = await createTestUserWithOrganization();

      const viewer = await createTestUser();
      await addMemberToOrganization(viewer, {
        organizationId: owner.organizationId,
        role: "viewer",
      });

      const [viewerMember] = await db
        .select()
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, viewer.user.id),
            eq(schema.members.organizationId, owner.organizationId)
          )
        )
        .limit(1);

      const response = await app.handle(
        new Request(
          "http://localhost/api/auth/organization/update-member-role",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...owner.headers,
            },
            body: JSON.stringify({
              memberId: viewerMember.id,
              role: "manager",
              organizationId: owner.organizationId,
            }),
          }
        )
      );

      expect(response.status).toBe(200);
    });

    test("should create audit log entry on role change", async () => {
      const owner = await createTestUserWithOrganization();

      const viewer = await createTestUser();
      await addMemberToOrganization(viewer, {
        organizationId: owner.organizationId,
        role: "viewer",
      });

      const [viewerMember] = await db
        .select()
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, viewer.user.id),
            eq(schema.members.organizationId, owner.organizationId)
          )
        )
        .limit(1);

      const response = await app.handle(
        new Request(
          "http://localhost/api/auth/organization/update-member-role",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...owner.headers,
            },
            body: JSON.stringify({
              memberId: viewerMember.id,
              role: "supervisor",
              organizationId: owner.organizationId,
            }),
          }
        )
      );

      expect(response.status).toBe(200);

      const [auditEntry] = await db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.resource, "member"),
            eq(schema.auditLogs.action, "update"),
            eq(schema.auditLogs.resourceId, viewerMember.id)
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(1);

      expect(auditEntry).toBeDefined();
      expect(auditEntry.organizationId).toBe(owner.organizationId);

      const changes = auditEntry.changes as {
        before: { role: string };
        after: { role: string };
      };
      expect(changes.before.role).toBe("viewer");
      expect(changes.after.role).toBe("supervisor");
    });
  });
});
