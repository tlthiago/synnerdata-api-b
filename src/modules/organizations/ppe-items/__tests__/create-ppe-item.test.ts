import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { PpeItemService } from "../ppe-item.service";

const BASE_URL = env.API_URL;

const validPpeItemData = {
  name: "Capacete de Segurança",
  description: "Capacete para proteção da cabeça",
  equipment: "Capacete Classe A",
};

describe("POST /v1/ppe-items", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPpeItemData),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPpeItemData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("NO_ACTIVE_ORGANIZATION");
  });

  test("should reject missing required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should return PT-BR message for empty name", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "",
          description: "Descrição",
          equipment: "Equipamento",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Nome é obrigatório");
  });

  test("should return PT-BR message for empty description", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Capacete",
          description: "",
          equipment: "Equipamento",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Descrição é obrigatória");
  });

  test("should return PT-BR message for empty equipment", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Capacete",
          description: "Descrição",
          equipment: "",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("Equipamento é obrigatório");
  });

  test("should create ppe item successfully", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPpeItemData),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("ppe-item-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe(validPpeItemData.name);
    expect(body.data.description).toBe(validPpeItemData.description);
    expect(body.data.equipment).toBe(validPpeItemData.equipment);
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s member from creating ppe item", async (role) => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPpeItemData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create ppe item", async () => {
    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );

    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validPpeItemData),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when creating ppe item with duplicate name and equipment", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await PpeItemService.create({
      organizationId,
      userId: user.id,
      name: "EPI Duplicado",
      description: "Descrição do EPI",
      equipment: "Equipamento Duplicado",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "EPI Duplicado",
          description: "Outra descrição",
          equipment: "Equipamento Duplicado",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_ITEM_ALREADY_EXISTS");
  });

  test("should allow creating ppe item with same name but different equipment", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await PpeItemService.create({
      organizationId,
      userId: user.id,
      name: "EPI Mesmo Nome",
      description: "Descrição do EPI",
      equipment: "Equipamento A",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "EPI Mesmo Nome",
          description: "Outra descrição",
          equipment: "Equipamento B",
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when creating ppe item with duplicate name and equipment (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await PpeItemService.create({
      organizationId,
      userId: user.id,
      name: "EPI Teste",
      description: "Descrição do EPI",
      equipment: "Equipamento Teste",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/ppe-items`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "epi teste",
          description: "Outra descrição",
          equipment: "equipamento teste",
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PPE_ITEM_ALREADY_EXISTS");
  });
});
