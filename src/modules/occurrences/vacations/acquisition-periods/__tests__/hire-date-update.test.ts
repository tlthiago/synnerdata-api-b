import { describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { AcquisitionPeriodService } from "../acquisition-period.service";

describe("HireDate update and acquisition period recalculation", () => {
  test("should recalculate periods when hireDate changes and no vacations linked", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2023-01-15",
    });

    // Generate initial periods
    await AcquisitionPeriodService.generateForEmployee(
      employee.id,
      organizationId,
      "2023-01-15"
    );

    // Verify periods exist
    const beforePeriods = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employee.id),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      );
    expect(beforePeriods.length).toBeGreaterThan(0);

    // Recalculate with new hireDate
    await AcquisitionPeriodService.recalculateForEmployee(
      employee.id,
      organizationId,
      "2023-06-01"
    );

    // Verify new periods
    const afterPeriods = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employee.id),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .orderBy(schema.vacationAcquisitionPeriods.acquisitionStart);

    expect(afterPeriods.length).toBeGreaterThan(0);
    // First period should start at new hireDate
    expect(afterPeriods[0].acquisitionStart).toBe("2023-06-01");
  });

  test("should block hireDate update when periods have daysUsed > 0", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2023-01-15",
    });

    // Generate periods
    await AcquisitionPeriodService.generateForEmployee(
      employee.id,
      organizationId,
      "2023-01-15"
    );

    // Manually set daysUsed > 0 on first period
    const [firstPeriod] = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employee.id),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .orderBy(schema.vacationAcquisitionPeriods.acquisitionStart)
      .limit(1);

    await db
      .update(schema.vacationAcquisitionPeriods)
      .set({ daysUsed: 15 })
      .where(eq(schema.vacationAcquisitionPeriods.id, firstPeriod.id));

    // Try to ensure recalculation — should throw
    try {
      await AcquisitionPeriodService.ensureRecalculationAllowed(employee.id);
      expect(true).toBe(false); // Should not reach here
    } catch (error: unknown) {
      const err = error as { code: string; status: number };
      expect(err.code).toBe("HIRE_DATE_UPDATE_BLOCKED");
      expect(err.status).toBe(409);
    }
  });

  test("should allow recalculation when all periods have daysUsed = 0", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2024-01-01",
    });

    await AcquisitionPeriodService.generateForEmployee(
      employee.id,
      organizationId,
      "2024-01-01"
    );

    // Should NOT throw
    await AcquisitionPeriodService.ensureRecalculationAllowed(employee.id);
  });
});
