import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestPromotion } from "@/test/helpers/promotion";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("GET /v1/promotions", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return empty list when no promotions exist", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBe(0);
  });

  test("should list all promotions for organization", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    await createTestPromotion({
      organizationId,
      userId: user.id,
      reason: "Primeira promoção",
    });

    await createTestPromotion({
      organizationId,
      userId: user.id,
      reason: "Segunda promoção",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0].employee).toBeObject();
    expect(body.data[0].employee.id).toBeString();
    expect(body.data[0].employee.name).toBeString();
    expect(body.data[0].previousJobPosition).toBeObject();
    expect(body.data[0].previousJobPosition.id).toBeString();
    expect(body.data[0].previousJobPosition.name).toBeString();
    expect(body.data[0].newJobPosition).toBeObject();
    expect(body.data[0].newJobPosition.id).toBeString();
    expect(body.data[0].newJobPosition.name).toBeString();
  });

  test("should not return promotions from other organizations", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { organizationId: otherOrgId, user: otherUser } =
      await createTestUserWithOrganization({ emailVerified: true });

    await createTestPromotion({
      organizationId,
      userId: user.id,
      reason: "Minha promoção",
    });

    await createTestPromotion({
      organizationId: otherOrgId,
      userId: otherUser.id,
      reason: "Promoção de outra organização",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();

    const hasOtherOrgPromotion = body.data.some(
      (p: { reason: string | null }) =>
        p.reason === "Promoção de outra organização"
    );
    expect(hasOtherOrgPromotion).toBe(false);
  });

  test("should not return deleted promotions", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { promotion } = await createTestPromotion({
      organizationId,
      userId: user.id,
      reason: "Promoção deletada",
    });

    const { PromotionService } = await import("../promotion.service");
    await PromotionService.delete(promotion.id, organizationId, user.id);

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
        headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    const hasDeletedPromotion = body.data.some(
      (p: { id: string }) => p.id === promotion.id
    );
    expect(hasDeletedPromotion).toBe(false);
  });

  test("should allow viewer to list promotions", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
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
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "GET",
        headers: memberResult.headers,
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toBeArray();
  });
});
