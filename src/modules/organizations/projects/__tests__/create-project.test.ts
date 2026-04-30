import { beforeAll, describe, expect, test } from "bun:test";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { generateCno } from "@/test/helpers/project";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";
import { ProjectService } from "../project.service";

const BASE_URL = env.API_URL;

const validProjectData = {
  name: "Construção Edifício Aurora",
  description: "Projeto de construção civil comercial",
  startDate: "2025-01-15",
  cno: "123456789012",
};

describe("POST /v1/projects", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validProjectData),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validProjectData),
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
      new Request(`${BASE_URL}/v1/projects`, {
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

  test("should return PT-BR messages for empty required fields", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "",
          description: "",
          startDate: "",
          cno: "123456789012",
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
    expect(messages).toContain("Descrição é obrigatória");
    expect(messages).toContain("Data de início é obrigatória");
  });

  test("should return PT-BR message for invalid CNO length", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validProjectData,
          cno: "12345", // Should be 12 chars
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("CNO deve ter exatamente 12 caracteres");
  });

  test("should create project successfully", async () => {
    const { headers, organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const cno = generateCno();
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validProjectData,
          cno,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.id).toStartWith("project-");
    expect(body.data.organizationId).toBe(organizationId);
    expect(body.data.name).toBe(validProjectData.name);
    expect(body.data.description).toBe(validProjectData.description);
    expect(body.data.startDate).toBe(validProjectData.startDate);
    expect(body.data.cno).toBe(cno);
    expect(body.data.employees).toBeArray();
    expect(body.data.employees).toHaveLength(0);
    expect(body.data.createdAt).toBeDefined();
    expect(body.data.updatedAt).toBeDefined();
    expect(body.data.createdBy).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    });
    expect(body.data.updatedBy).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    });
  });

  test("should create project with employees", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee: employee1 } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const { employee: employee2 } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const cno = generateCno();
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validProjectData,
          cno,
          employeeIds: [employee1.id, employee2.id],
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data.employees).toBeArray();
    expect(body.data.employees).toHaveLength(2);
    const employeeIds = body.data.employees.map((e: { id: string }) => e.id);
    expect(employeeIds).toContain(employee1.id);
    expect(employeeIds).toContain(employee2.id);
  });

  test("should reject invalid employee in employeeIds", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validProjectData,
          employeeIds: ["invalid-employee-id"],
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should reject employee from different organization", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    // Create employee in different organization
    const { organizationId: otherOrgId, user: otherUser } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const { employee: otherEmployee } = await createTestEmployee({
      organizationId: otherOrgId,
      userId: otherUser.id,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validProjectData,
          employeeIds: [otherEmployee.id],
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test.each([
    "viewer",
    "supervisor",
  ] as const)("should reject %s from creating project", async (role) => {
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
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validProjectData),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should allow manager to create project", async () => {
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
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...validProjectData,
          cno: generateCno(),
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should return 409 when creating project with duplicate name", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await ProjectService.create({
      organizationId,
      userId: user.id,
      name: "Projeto Duplicado",
      description: "Descrição do projeto",
      startDate: "2025-01-15",
      cno: generateCno(),
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Projeto Duplicado",
          description: "Outra descrição",
          startDate: "2025-02-01",
          cno: generateCno(),
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NAME_ALREADY_EXISTS");
  });

  test("should return 409 when creating project with duplicate cno", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    const cno = generateCno();
    await ProjectService.create({
      organizationId,
      userId: user.id,
      name: "Projeto A",
      description: "Descrição do projeto A",
      startDate: "2025-01-15",
      cno,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Projeto B",
          description: "Descrição do projeto B",
          startDate: "2025-02-01",
          cno,
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_CNO_ALREADY_EXISTS");
  });

  test("should return 409 when creating project with duplicate name (case-insensitive)", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({
        emailVerified: true,
      });

    await ProjectService.create({
      organizationId,
      userId: user.id,
      name: "Projeto Teste",
      description: "Descrição do projeto",
      startDate: "2025-01-15",
      cno: generateCno(),
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/projects`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "projeto teste",
          description: "Outra descrição",
          startDate: "2025-02-01",
          cno: generateCno(),
        }),
      })
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("PROJECT_NAME_ALREADY_EXISTS");
  });
});
