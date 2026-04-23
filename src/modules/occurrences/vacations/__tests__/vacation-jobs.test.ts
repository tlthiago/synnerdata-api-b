import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { createTestVacation } from "@/test/helpers/vacation";
import { VacationJobsService } from "../vacation-jobs.service";

describe("VacationJobsService", () => {
  let organizationId: string;
  let userId: string;

  beforeAll(async () => {
    const result = await createTestUserWithOrganization({
      emailVerified: true,
    });
    organizationId = result.organizationId;
    userId = result.user.id;
  });

  describe("activateScheduledVacations", () => {
    test("should activate scheduled vacations where startDate <= today", async () => {
      const { employee } = await createTestEmployee({
        organizationId,
        userId,
        hireDate: "2024-06-10",
      });

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const startDate = yesterday.toISOString().split("T")[0];
      const endDate = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const daysEntitled =
        Math.round(
          (new Date(`${endDate}T00:00:00Z`).getTime() -
            new Date(`${startDate}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      const vacation = await createTestVacation({
        organizationId,
        userId,
        employeeId: employee.id,
        startDate,
        endDate,
        daysEntitled,
        daysUsed: 0,
        status: "scheduled",
      });

      const result = await VacationJobsService.activateScheduledVacations();

      expect(result.updated).toContain(vacation.id);

      const [updatedVacation] = await db
        .select({ status: schema.vacations.status })
        .from(schema.vacations)
        .where(eq(schema.vacations.id, vacation.id))
        .limit(1);
      expect(updatedVacation.status).toBe("in_progress");

      const [updatedEmployee] = await db
        .select({ status: schema.employees.status })
        .from(schema.employees)
        .where(eq(schema.employees.id, employee.id))
        .limit(1);
      expect(updatedEmployee.status).toBe("ON_VACATION");
    });

    test("should not activate future scheduled vacations", async () => {
      const { employee } = await createTestEmployee({
        organizationId,
        userId,
        hireDate: "2024-06-10",
      });

      const future = new Date();
      future.setDate(future.getDate() + 30);
      const startDate = future.toISOString().split("T")[0];
      const endDateObj = new Date(future);
      endDateObj.setDate(future.getDate() + 10);
      const endDate = endDateObj.toISOString().split("T")[0];
      const daysEntitled =
        Math.round(
          (new Date(`${endDate}T00:00:00Z`).getTime() -
            new Date(`${startDate}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      const vacation = await createTestVacation({
        organizationId,
        userId,
        employeeId: employee.id,
        startDate,
        endDate,
        daysEntitled,
        daysUsed: 0,
        status: "scheduled",
      });

      const result = await VacationJobsService.activateScheduledVacations();

      expect(result.updated).not.toContain(vacation.id);

      const [unchangedVacation] = await db
        .select({ status: schema.vacations.status })
        .from(schema.vacations)
        .where(eq(schema.vacations.id, vacation.id))
        .limit(1);
      expect(unchangedVacation.status).toBe("scheduled");
    });
  });

  describe("completeExpiredVacations", () => {
    test("should complete in_progress vacations where endDate < today", async () => {
      const { employee } = await createTestEmployee({
        organizationId,
        userId,
        hireDate: "2024-06-10",
      });

      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 10);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() - 1);
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];
      const daysEntitled =
        Math.round(
          (new Date(`${endStr}T00:00:00Z`).getTime() -
            new Date(`${startStr}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      const vacation = await createTestVacation({
        organizationId,
        userId,
        employeeId: employee.id,
        startDate: startStr,
        endDate: endStr,
        daysEntitled,
        daysUsed: 0,
        status: "in_progress",
      });

      const result = await VacationJobsService.completeExpiredVacations();

      expect(result.updated).toContain(vacation.id);

      const [updatedVacation] = await db
        .select({ status: schema.vacations.status })
        .from(schema.vacations)
        .where(eq(schema.vacations.id, vacation.id))
        .limit(1);
      expect(updatedVacation.status).toBe("completed");

      const [updatedEmployee] = await db
        .select({ status: schema.employees.status })
        .from(schema.employees)
        .where(eq(schema.employees.id, employee.id))
        .limit(1);
      expect(updatedEmployee.status).toBe("ACTIVE");
    });

    test("should not complete in_progress vacations where endDate >= today", async () => {
      const { employee } = await createTestEmployee({
        organizationId,
        userId,
        hireDate: "2024-06-10",
      });

      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 5);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 5);
      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];
      const daysEntitled =
        Math.round(
          (new Date(`${endStr}T00:00:00Z`).getTime() -
            new Date(`${startStr}T00:00:00Z`).getTime()) /
            (1000 * 60 * 60 * 24)
        ) + 1;

      const vacation = await createTestVacation({
        organizationId,
        userId,
        employeeId: employee.id,
        startDate: startStr,
        endDate: endStr,
        daysEntitled,
        daysUsed: 0,
        status: "in_progress",
      });

      const result = await VacationJobsService.completeExpiredVacations();

      expect(result.updated).not.toContain(vacation.id);

      const [unchangedVacation] = await db
        .select({ status: schema.vacations.status })
        .from(schema.vacations)
        .where(eq(schema.vacations.id, vacation.id))
        .limit(1);
      expect(unchangedVacation.status).toBe("in_progress");
    });
  });
});
