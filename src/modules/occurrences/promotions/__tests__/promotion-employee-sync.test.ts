import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { env } from "@/env";
import { createTestApp, type TestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestJobPosition } from "@/test/helpers/job-position";
import { createTestPromotion } from "@/test/helpers/promotion";
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

  describe("Update — latest guard + employee re-sync", () => {
    test("should reject update of a non-latest promotion", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({ emailVerified: true });

      const { employee } = await createTestEmployee({
        organizationId,
        userId: user.id,
      });

      const prevPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Estagiário",
      });

      const midPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Júnior",
      });

      const newPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Pleno",
      });

      // Create older promotion
      const firstResponse = await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: prevPos.id,
            newJobPositionId: midPos.id,
            promotionDate: "2024-01-15",
            previousSalary: 2000,
            newSalary: 3000,
          }),
        })
      );
      const firstPromotion = (await firstResponse.json()).data;

      // Create newer promotion
      await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: midPos.id,
            newJobPositionId: newPos.id,
            promotionDate: "2024-06-15",
            previousSalary: 3000,
            newSalary: 4000,
          }),
        })
      );

      // Try to update the older promotion
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/promotions/${firstPromotion.id}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Updated reason" }),
        })
      );

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.code).toBe("PROMOTION_NOT_LATEST");
    });

    test("should allow update of the latest promotion and re-sync employee", async () => {
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

      const seniorPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Sênior",
      });

      // Create promotion
      const createResponse = await app.handle(
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
      const promotion = (await createResponse.json()).data;

      // Update salary and job position on the latest promotion
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            newSalary: 5000,
            newJobPositionId: seniorPosition.id,
          }),
        })
      );

      expect(response.status).toBe(200);

      // Employee should reflect the updated values
      const updatedEmployee = await getEmployeeRaw(employee.id, organizationId);
      expect(updatedEmployee.salary).toBe("5000.00");
      expect(updatedEmployee.jobPositionId).toBe(seniorPosition.id);
    });

    test("should allow update of the only promotion (it is the latest)", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({ emailVerified: true });

      const { promotion } = await createTestPromotion({
        organizationId,
        userId: user.id,
        previousSalary: 3000,
        newSalary: 3600,
      });

      const response = await app.handle(
        new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            newSalary: 4000,
            previousSalary: 3000,
          }),
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe("Delete — latest guard + employee revert", () => {
    test("should reject delete of a non-latest promotion", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({ emailVerified: true });

      const { employee } = await createTestEmployee({
        organizationId,
        userId: user.id,
      });

      const prevPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Estagiário",
      });

      const midPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Júnior",
      });

      const newPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Pleno",
      });

      // Create older promotion
      const firstResponse = await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: prevPos.id,
            newJobPositionId: midPos.id,
            promotionDate: "2024-01-15",
            previousSalary: 2000,
            newSalary: 3000,
          }),
        })
      );
      const firstPromotion = (await firstResponse.json()).data;

      // Create newer promotion
      await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: midPos.id,
            newJobPositionId: newPos.id,
            promotionDate: "2024-06-15",
            previousSalary: 3000,
            newSalary: 4000,
          }),
        })
      );

      // Try to delete the older promotion
      const response = await app.handle(
        new Request(`${BASE_URL}/v1/promotions/${firstPromotion.id}`, {
          method: "DELETE",
          headers,
        })
      );

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.error.code).toBe("PROMOTION_NOT_LATEST");
    });

    test("should revert employee to previous promotion values when deleting latest", async () => {
      const { headers, organizationId, user } =
        await createTestUserWithOrganization({ emailVerified: true });

      const { employee } = await createTestEmployee({
        organizationId,
        userId: user.id,
      });

      const midPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Júnior",
      });

      const newPos = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Pleno",
      });

      // Create first promotion (2024-01-15)
      await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: employee.jobPosition.id,
            newJobPositionId: midPos.id,
            promotionDate: "2024-01-15",
            previousSalary: 3000,
            newSalary: 4000,
          }),
        })
      );

      // Create second promotion (2024-06-15)
      const secondResponse = await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: midPos.id,
            newJobPositionId: newPos.id,
            promotionDate: "2024-06-15",
            previousSalary: 4000,
            newSalary: 5000,
          }),
        })
      );
      const secondPromotion = (await secondResponse.json()).data;

      // Employee should be at 5000 / newPos
      const beforeDelete = await getEmployeeRaw(employee.id, organizationId);
      expect(beforeDelete.salary).toBe("5000.00");
      expect(beforeDelete.jobPositionId).toBe(newPos.id);

      // Delete the latest promotion
      const deleteResponse = await app.handle(
        new Request(`${BASE_URL}/v1/promotions/${secondPromotion.id}`, {
          method: "DELETE",
          headers,
        })
      );

      expect(deleteResponse.status).toBe(200);

      // Employee should revert to first promotion values (4000 / midPos)
      const afterDelete = await getEmployeeRaw(employee.id, organizationId);
      expect(afterDelete.salary).toBe("4000.00");
      expect(afterDelete.jobPositionId).toBe(midPos.id);
    });

    test("should revert employee to pre-promotion values when deleting the only promotion", async () => {
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
      const originalSalary = originalEmployee.salary;
      const originalJobPositionId = originalEmployee.jobPositionId;

      const newJobPosition = await createTestJobPosition({
        organizationId,
        userId: user.id,
        name: "Analista Pleno",
      });

      // Create single promotion
      const createResponse = await app.handle(
        new Request(`${BASE_URL}/v1/promotions`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            previousJobPositionId: employee.jobPosition.id,
            newJobPositionId: newJobPosition.id,
            promotionDate: "2024-06-15",
            previousSalary: Number.parseFloat(originalSalary),
            newSalary: Number.parseFloat(originalSalary) + 1000,
          }),
        })
      );
      const promotion = (await createResponse.json()).data;

      // Delete the only promotion
      const deleteResponse = await app.handle(
        new Request(`${BASE_URL}/v1/promotions/${promotion.id}`, {
          method: "DELETE",
          headers,
        })
      );

      expect(deleteResponse.status).toBe(200);

      // Employee should revert to original values
      const afterDelete = await getEmployeeRaw(employee.id, organizationId);
      expect(afterDelete.salary).toBe(originalSalary);
      expect(afterDelete.jobPositionId).toBe(originalJobPositionId);
    });
  });
});
