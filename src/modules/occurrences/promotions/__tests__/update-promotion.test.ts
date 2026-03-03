import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPromotion } from "@/test/helpers/promotion";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("PUT /v1/promotions/:id", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/promotion-123`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Updated" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/promotion-123`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject when promotion does not exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/promotion-nonexistent`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROMOTION_NOT_FOUND");
  });

  test("should reject future promotionDate on update", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { promotion } = await createTestPromotion({
      organizationId,
      userId: user.id,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          promotionDate: futureDateStr,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject when promotion belongs to different organization", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { headers: otherHeaders } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { promotion } = await createTestPromotion({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
        method: "PUT",
        headers: { ...otherHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Updated reason" }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PROMOTION_NOT_FOUND");
  });

  test("should update promotion successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { promotion, dependencies } = await createTestPromotion({
      organizationId,
      userId: user.id,
      reason: "Original reason",
      notes: "Original notes",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Updated reason",
          notes: "Updated notes",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(promotion.id);
    expect(body.data.reason).toBe("Updated reason");
    expect(body.data.notes).toBe("Updated notes");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(dependencies.employeeId);
    expect(body.data.employee.name).toBeString();
    expect(body.data.previousJobPosition).toBeObject();
    expect(body.data.previousJobPosition.id).toBe(
      dependencies.previousJobPositionId
    );
    expect(body.data.previousJobPosition.name).toBeString();
    expect(body.data.newJobPosition).toBeObject();
    expect(body.data.newJobPosition.id).toBe(dependencies.newJobPositionId);
    expect(body.data.newJobPosition.name).toBeString();
  });

  test("should allow supervisor to update promotion", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { promotion } = await createTestPromotion({
      organizationId,
      userId: user.id,
    });

    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "supervisor",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated by supervisor" }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.reason).toBe("Updated by supervisor");
  });

  test("should reject viewer from updating promotion", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { promotion } = await createTestPromotion({
      organizationId,
      userId: user.id,
    });

    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "viewer",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
        method: "PUT",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Updated" }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
