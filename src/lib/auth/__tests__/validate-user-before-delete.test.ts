import { beforeAll, describe, expect, test } from "bun:test";
import { validateUserBeforeDelete } from "@/lib/auth/hooks";
import { BadRequestError } from "@/lib/errors/http-errors";
import { OrganizationFactory } from "@/test/factories/organization.factory";
import { PlanFactory } from "@/test/factories/payments/plan.factory";
import { SubscriptionFactory } from "@/test/factories/payments/subscription.factory";
import { UserFactory } from "@/test/factories/user.factory";

describe("validateUserBeforeDelete (direct invocation)", () => {
  beforeAll(async () => {
    await PlanFactory.createTrial();
  });

  test("throws BadRequestError with ADMIN_ACCOUNT_DELETE_FORBIDDEN for admin", async () => {
    const adminResult = await UserFactory.createAdmin({ role: "admin" });

    expect.assertions(3);
    try {
      await validateUserBeforeDelete({
        id: adminResult.user.id,
        email: adminResult.user.email,
        role: "admin",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).code).toBe(
        "ADMIN_ACCOUNT_DELETE_FORBIDDEN"
      );
      expect((error as BadRequestError).status).toBe(400);
    }
  });

  test("throws BadRequestError with ADMIN_ACCOUNT_DELETE_FORBIDDEN for super_admin", async () => {
    const superAdminResult = await UserFactory.createAdmin({
      role: "super_admin",
    });

    expect.assertions(2);
    try {
      await validateUserBeforeDelete({
        id: superAdminResult.user.id,
        email: superAdminResult.user.email,
        role: "super_admin",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).code).toBe(
        "ADMIN_ACCOUNT_DELETE_FORBIDDEN"
      );
    }
  });

  test("throws BadRequestError with ACTIVE_SUBSCRIPTION for owner with active paid subscription", async () => {
    const ownerResult = await UserFactory.create();
    const org = await OrganizationFactory.create();
    await OrganizationFactory.addMember(ownerResult, {
      organizationId: org.id,
      role: "owner",
    });

    const { plan } = await PlanFactory.createPaid("gold");
    await SubscriptionFactory.createActive(org.id, plan.id);

    expect.assertions(2);
    try {
      await validateUserBeforeDelete({
        id: ownerResult.user.id,
        email: ownerResult.user.email,
        role: "user",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).code).toBe("ACTIVE_SUBSCRIPTION");
    }
  });

  test("throws BadRequestError with ORGANIZATION_HAS_MEMBERS for owner with other members", async () => {
    const ownerResult = await UserFactory.create();
    const memberResult = await UserFactory.create();
    const org = await OrganizationFactory.create();
    await OrganizationFactory.addMember(ownerResult, {
      organizationId: org.id,
      role: "owner",
    });
    await OrganizationFactory.addMember(memberResult, {
      organizationId: org.id,
      role: "viewer",
    });

    expect.assertions(2);
    try {
      await validateUserBeforeDelete({
        id: ownerResult.user.id,
        email: ownerResult.user.email,
        role: "user",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).code).toBe("ORGANIZATION_HAS_MEMBERS");
    }
  });

  test("returns null for user without organization membership", async () => {
    const userResult = await UserFactory.create();

    const result = await validateUserBeforeDelete({
      id: userResult.user.id,
      email: userResult.user.email,
      role: "user",
    });

    expect(result).toBeNull();
  });

  test("returns organizationId for sole owner of trial organization", async () => {
    const ownerResult = await UserFactory.create();
    const org = await OrganizationFactory.create();
    await OrganizationFactory.addMember(ownerResult, {
      organizationId: org.id,
      role: "owner",
    });

    const { plan } = await PlanFactory.createTrial();
    await SubscriptionFactory.createTrial(org.id, plan.id);

    const result = await validateUserBeforeDelete({
      id: ownerResult.user.id,
      email: ownerResult.user.email,
      role: "user",
    });

    expect(result).toBe(org.id);
  });

  test("returns null for non-owner member (cascade handled at delete-time)", async () => {
    const ownerResult = await UserFactory.create();
    const memberResult = await UserFactory.create();
    const org = await OrganizationFactory.create();
    await OrganizationFactory.addMember(ownerResult, {
      organizationId: org.id,
      role: "owner",
    });
    await OrganizationFactory.addMember(memberResult, {
      organizationId: org.id,
      role: "viewer",
    });

    const result = await validateUserBeforeDelete({
      id: memberResult.user.id,
      email: memberResult.user.email,
      role: "user",
    });

    expect(result).toBeNull();
  });
});
