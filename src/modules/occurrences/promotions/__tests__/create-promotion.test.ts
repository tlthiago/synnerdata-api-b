import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestJobPosition } from "@/test/helpers/job-position";
import {
  createTestUser,
  createTestUserWithOrganization,
} from "@/test/helpers/user";

const BASE_URL = env.API_URL;

describe("POST /v1/promotions", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  test("should reject unauthenticated requests", async () => {
    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          previousJobPositionId: "job-position-123",
          newJobPositionId: "job-position-456",
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("should reject user without active organization", async () => {
    const { headers } = await createTestUser({ emailVerified: true });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          previousJobPositionId: "job-position-123",
          newJobPositionId: "job-position-456",
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
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
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
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
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "",
          previousJobPositionId: "",
          newJobPositionId: "",
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const messages = body.error.details.map(
      (d: { message: string }) => d.message
    );
    expect(messages).toContain("ID do funcionário é obrigatório");
    expect(messages).toContain("ID do cargo anterior é obrigatório");
    expect(messages).toContain("ID do novo cargo é obrigatório");
  });

  test("should reject future promotionDate", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          previousJobPositionId: "job-position-123",
          newJobPositionId: "job-position-456",
          promotionDate: futureDateStr,
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("should reject when employee does not exist", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-nonexistent",
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_NOT_FOUND");
  });

  test("should reject when previous job position does not exist", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: "job-position-nonexistent",
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_NOT_FOUND");
  });

  test("should reject when new job position does not exist", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: "job-position-nonexistent",
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("JOB_POSITION_NOT_FOUND");
  });

  test("should reject when previous and new job positions are the same", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const jobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: jobPosition.id,
          newJobPositionId: jobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_PROMOTION_DATA");
  });

  test("should reject when new salary is not greater than previous salary", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3000,
        }),
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("INVALID_PROMOTION_DATA");
  });

  test("should create promotion successfully", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
          reason: "Promoção por mérito",
          notes: "Excelente desempenho no último ano",
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toStartWith("promotion-");
    expect(body.data.employee).toBeObject();
    expect(body.data.employee.id).toBe(employee.id);
    expect(body.data.employee.name).toBe(employee.name);
    expect(body.data.previousJobPosition).toBeObject();
    expect(body.data.previousJobPosition.id).toBe(previousJobPosition.id);
    expect(body.data.previousJobPosition.name).toBe(previousJobPosition.name);
    expect(body.data.newJobPosition).toBeObject();
    expect(body.data.newJobPosition.id).toBe(newJobPosition.id);
    expect(body.data.newJobPosition.name).toBe(newJobPosition.name);
    expect(body.data.previousSalary).toBe("3000.00");
    expect(body.data.newSalary).toBe("3600.00");
    expect(body.data.reason).toBe("Promoção por mérito");
    expect(body.data.notes).toBe("Excelente desempenho no último ano");
    expect(body.data.createdBy).toBeObject();
    expect(body.data.createdBy.id).toBeString();
    expect(body.data.createdBy.name).toBeString();
    expect(body.data.updatedBy).toBeObject();
    expect(body.data.updatedBy.id).toBeString();
    expect(body.data.updatedBy.name).toBeString();
  });

  test("should reject duplicate promotion on same date", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const prevPos1 = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newPos1 = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const first = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: prevPos1.id,
          newJobPositionId: newPos1.id,
          promotionDate: "2024-02-20",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );
    expect(first.status).toBe(200);

    const prevPos2 = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno B",
    });

    const newPos2 = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Sênior",
    });

    const second = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: prevPos2.id,
          newJobPositionId: newPos2.id,
          promotionDate: "2024-02-20",
          previousSalary: 3600,
          newSalary: 4200,
        }),
      })
    );
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe("PROMOTION_DUPLICATE_DATE");
  });

  test("should reject promotion for TERMINATED employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await db
      .update(schema.employees)
      .set({ status: "TERMINATED" })
      .where(eq(schema.employees.id, employee.id));

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_TERMINATED");
  });

  test("should reject promotion for ON_VACATION employee", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    await db
      .update(schema.employees)
      .set({ status: "ON_VACATION" })
      .where(eq(schema.employees.id, employee.id));

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("EMPLOYEE_ON_VACATION");
  });

  test("should allow manager to create promotion", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "manager",
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: memberResult.user.id,
    });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: memberResult.user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: memberResult.user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should allow supervisor to create promotion", async () => {
    const { organizationId } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const { addMemberToOrganization } = await import(
      "@/test/helpers/organization"
    );
    const memberResult = await createTestUser({ emailVerified: true });
    await addMemberToOrganization(memberResult, {
      organizationId,
      role: "supervisor",
    });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: memberResult.user.id,
    });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: memberResult.user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: memberResult.user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(200);
  });

  test("should reject viewer from creating promotion", async () => {
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
        method: "POST",
        headers: {
          ...memberResult.headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: "employee-123",
          previousJobPositionId: "job-position-123",
          newJobPositionId: "job-position-456",
          promotionDate: "2024-01-15",
          previousSalary: 3000,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  test("should reject string salary values", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          previousJobPositionId: "job-position-123",
          newJobPositionId: "job-position-456",
          promotionDate: "2024-01-15",
          previousSalary: "3000.00",
          newSalary: "3600.00",
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should reject negative salary values", async () => {
    const { headers } = await createTestUserWithOrganization({
      emailVerified: true,
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: "employee-123",
          previousJobPositionId: "job-position-123",
          newJobPositionId: "job-position-456",
          promotionDate: "2024-01-15",
          previousSalary: -100,
          newSalary: 3600,
        }),
      })
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  test("should create promotion with decimal salary values", async () => {
    const { headers, organizationId, user } =
      await createTestUserWithOrganization({ emailVerified: true });

    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    const previousJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Júnior",
    });

    const newJobPosition = await createTestJobPosition({
      organizationId,
      userId: user.id,
      name: "Analista Pleno",
    });

    const response = await app.handle(
      new Request(`${BASE_URL}/v1/promotions`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          previousJobPositionId: previousJobPosition.id,
          newJobPositionId: newJobPosition.id,
          promotionDate: "2024-01-15",
          previousSalary: 2608.6,
          newSalary: 3100.0,
        }),
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.previousSalary).toBeString();
    expect(body.data.newSalary).toBeString();
  });
});
