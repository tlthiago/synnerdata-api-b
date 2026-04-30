import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestTermination } from "@/test/helpers/termination";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/terminations/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-123`, {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-123`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject viewer member from deleting termination", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    const viewerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(viewerResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers: viewerResult.headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject non-existent termination", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/termination-nonexistent`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_NOT_FOUND");
  });

  test("should reject termination from another organization", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const otherOrgResult = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const otherTermination = await createTestTermination({
      organizationId: otherOrgResult.organizationId,
      userId: otherOrgResult.user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${otherTermination.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_NOT_FOUND");
  });

  test("should reject already deleted termination", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers,
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("TERMINATION_ALREADY_DELETED");
  });

  test("should soft delete termination successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(termination.id);
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(termination.employee.id);
    expect(body.data.employee.name).toBeString();
    expect(body.data.deletedAt).toBeDefined();
    expect(body.data.status).toBe("canceled");
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();

    const [deletedTermination] = await db
      .select()
      .from(schema.terminations)
      .where(eq(schema.terminations.id, termination.id))
      .limit(1);

    expect(deletedTermination.deletedAt).not.toBeNull();
  });

  test("should allow manager to delete termination", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    const managerResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(managerResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers: managerResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("canceled");
  });

  test("should revert employee status to ACTIVE after deleting termination", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    const [beforeEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, termination.employee.id))
      .limit(1);
    expect(beforeEmployee.status).toBe("TERMINATED");

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);

    const [afterEmployee] = await db
      .select({ status: schema.employees.status })
      .from(schema.employees)
      .where(eq(schema.employees.id, termination.employee.id))
      .limit(1);
    expect(afterEmployee.status).toBe("ACTIVE");
  });

  test("should not list deleted termination", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const termination = await createTestTermination({
      organizationId,
      userId: user.id,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/terminations/${termination.id}`, {
        method: "DELETE",
        headers,
      })
    );

    const listResponse = await app.handle(
      new Request(`${BASE_URL}/v1/terminations`, {
        headers,
      })
    );

    const listBody = await listResponse.json();
    const foundDeleted = listBody.data.find(
      (t: { id: string }) => t.id === termination.id
    );
    expect(foundDeleted).toBeUndefined();
  });
});
