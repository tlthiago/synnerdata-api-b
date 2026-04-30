import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestAbsence } from "@/test/helpers/absence";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { addMemberToOrganization } from "@/test/helpers/organization";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("DELETE /v1/absences/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should delete absence successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const absence = await createTestAbsence({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.deletedAt).toBeDefined();
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBeString();
    expect(body.data.employee.name).toBeString();
  });

  test("should reject non-existent absence", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/absence-nonexistent`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
  });

  test("should reject already deleted absence", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });
    const absence = await createTestAbsence({
      organizationId,
      userId: user.id,
    });

    await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "DELETE",
        headers,
      })
    );

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "DELETE",
        headers,
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("ABSENCE_ALREADY_DELETED");
  });

  test("should populate updatedBy with the deleter on soft-delete (Semantic A)", async () => {
    const owner = await createTestUserWithOrganization({ emailVerified: true });
    const absence = await createTestAbsence({
      organizationId: owner.organizationId,
      userId: owner.user.id,
    });

    const member = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(member, {
      organizationId: owner.organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/absences/${absence.id}`, {
        method: "DELETE",
        headers: member.headers,
      })
    );
    expect(response.status).toBe(200);

    const [row] = await db
      .select({
        createdBy: schema.absences.createdBy,
        updatedBy: schema.absences.updatedBy,
        deletedAt: schema.absences.deletedAt,
      })
      .from(schema.absences)
      .where(eq(schema.absences.id, absence.id))
      .limit(1);

    expect(row.deletedAt).not.toBeNull();
    expect(row.createdBy).toBe(owner.user.id);
    expect(row.updatedBy).toBe(member.user.id);
  });
});
