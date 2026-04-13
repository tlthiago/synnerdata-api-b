import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestUserWithOrganization } from "@/test/helpers/user";

const BASE_URL = env.API_URL;

async function getEmployeeRaw(employeeId: string, organizationId: string) {
  const [employee] = await db
    .select({
      salary: schema.employees.salary,
      jobPositionId: schema.employees.jobPositionId,
    })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.organizationId, organizationId),
        isNull(schema.employees.deletedAt)
      )
    )
    .limit(1);

  return employee;
}

describe("Promotion-Employee Sync", () => {
  let app: TestApp;

  beforeAll(() => {
    app = createTestApp();
  });

  describe("Create — employee sync", () => {
    test("should update employee salary and jobPosition when creating latest promotion", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({ emailVerified: true });

      const { employee } = await createTestEmployee({
        organizationId,
        userId: user.id,
      });

      const originalEmployee = await getEmployeeRaw(
        employee.id,
        organizationId
      );

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
            previousJobPositionId: employee.jobPosition.id,
            newJobPositionId: newJobPosition.id,
            promotionDate: "2024-06-15",
            previousSalary: 3000,
            newSalary: 4000,
          }),
        })
      );

      expect(response.status).toBe(200);

      const updatedEmployee = await getEmployeeRaw(employee.id, organizationId);
      expect(updatedEmployee.salary).toBe("4000.00");
      expect(updatedEmployee.jobPositionId).toBe(newJobPosition.id);
      expect(updatedEmployee.salary).not.toBe(originalEmployee.salary);
    });

    test("should NOT update employee when creating retroactive promotion (older date)", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({ emailVerified: true });

      const { employee } = await createTestEmployee({
        organizationId,
        userId: user.id,
      });

      const newJobPosition1 = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Pleno",
      });

      const newJobPosition2 = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Sênior",
      });

      // Create a recent promotion first (2024-06-15)
      await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: employee.jobPosition.id,
            newJobPositionId: newJobPosition1.id,
            promotionDate: "2024-06-15",
            previousSalary: 3000,
            newSalary: 4000,
          }),
        })
      );

      // Now create an older promotion (2024-01-15)
      const previousJobPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Estagiário",
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: previousJobPosition.id,
            newJobPositionId: newJobPosition2.id,
            promotionDate: "2024-01-15",
            previousSalary: 2000,
            newSalary: 2500,
          }),
        })
      );

      expect(response.status).toBe(200);

      // Employee should still reflect the most recent promotion (2024-06-15)
      const updatedEmployee = await getEmployeeRaw(employee.id, organizationId);
      expect(updatedEmployee.salary).toBe("4000.00");
      expect(updatedEmployee.jobPositionId).toBe(newJobPosition1.id);
    });
  });
});
