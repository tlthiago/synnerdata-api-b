import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestPpeItem } from "@/test/helpers/ppe-item";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/ppe-deliveries", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-123",
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should return 404 for non-existent employee", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-nonexistent",
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should create ppe delivery without items", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("ppe-delivery-");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBe(employee.name);
    expect(body.data.deliveryDate).toBe("2025-12-26");
    expect(body.data.reason).toBe("Admissão");
    expect(body.data.deliveredBy).toBe("João Silva");
    expect(body.data.items).toBeArray();
    expect(body.data.items.length).toBe(0);
  });

  test("should create ppe delivery with items", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const ppeItem1 = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Capacete",
    });

    const ppeItem2 = await createTestPpeItem({
      organizationId,
      userId: user.id,
      name: "Luvas",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
          ppeItemIds: [ppeItem1.id, ppeItem2.id],
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.data.items.length).toBe(2);
    const itemNames = body.data.items.map((i: { name: string }) => i.name);
    expect(itemNames).toContain("Capacete");
    expect(itemNames).toContain("Luvas");
  });

  test("should return 404 for non-existent ppe item", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
          ppeItemIds: ["ppe-item-nonexistent"],
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_ITEM_NOT_FOUND");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from creating ppe delivery", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const owner = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId: owner.organizationId,
      userId: owner.user.id,
    });

    const member = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(member, {
      organizationId: owner.organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...member.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create ppe delivery", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const owner = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { employee } = await createTestEmployee({
      organizationId: owner.organizationId,
      userId: owner.user.id,
    });

    const manager = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(manager, {
      organizationId: owner.organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-deliveries`, {
        method: "POST",
        headers: {
          ...manager.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          deliveryDate: "2025-12-26",
          reason: "Admissão",
          deliveredBy: "João Silva",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.id).toStartWith("ppe-delivery-");
  });
});
