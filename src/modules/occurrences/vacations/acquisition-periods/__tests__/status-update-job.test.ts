import { describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { AcquisitionPeriodService } from "../acquisition-period.service";

describe("AcquisitionPeriodService.updatePeriodStatuses", () => {
  test("should transition pending to available when acquisitionEnd <= today", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    // Create a period that should be available (acquisitionEnd in the past)
    const periodId = `acquisition-period-${crypto.randomUUID()}`;
    await db.insert(schema.vacationAcquisitionPeriods).values({
      id: periodId,
      organizationId,
      employeeId: employee.id,
      acquisitionStart: "2025-01-01",
      acquisitionEnd: "2025-12-31",
      concessionStart: "2026-01-01",
      concessionEnd: "2026-12-31",
      daysEntitled: 30,
      daysUsed: 0,
      status: "pending", // Should transition to available
    });

    const result = await AcquisitionPeriodService.updatePeriodStatuses();
    expect(result.activated).toBeGreaterThanOrEqual(1);

    // Verify status changed
    const [period] = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(eq(schema.vacationAcquisitionPeriods.id, periodId));
    expect(period.status).toBe("available");
  });

  test("should transition available to expired when concessionEnd < today", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    // Create a period with expired concession
    const periodId = `acquisition-period-${crypto.randomUUID()}`;
    await db.insert(schema.vacationAcquisitionPeriods).values({
      id: periodId,
      organizationId,
      employeeId: employee.id,
      acquisitionStart: "2022-01-01",
      acquisitionEnd: "2022-12-31",
      concessionStart: "2023-01-01",
      concessionEnd: "2023-12-31", // Past today
      daysEntitled: 30,
      daysUsed: 0, // Not fully used
      status: "available", // Should transition to expired
    });

    const result = await AcquisitionPeriodService.updatePeriodStatuses();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const [period] = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(eq(schema.vacationAcquisitionPeriods.id, periodId));
    expect(period.status).toBe("expired");
  });

  test("should NOT expire used periods", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    // Create a fully used period with expired concession
    const periodId = `acquisition-period-${crypto.randomUUID()}`;
    await db.insert(schema.vacationAcquisitionPeriods).values({
      id: periodId,
      organizationId,
      employeeId: employee.id,
      acquisitionStart: "2021-01-01",
      acquisitionEnd: "2021-12-31",
      concessionStart: "2022-01-01",
      concessionEnd: "2022-12-31",
      daysEntitled: 30,
      daysUsed: 30, // Fully used
      status: "used",
    });

    await AcquisitionPeriodService.updatePeriodStatuses();

    const [period] = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(eq(schema.vacationAcquisitionPeriods.id, periodId));
    expect(period.status).toBe("used"); // Should remain used
  });

  test("should generate next period when no pending period exists", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
    });

    // Create an available period with no pending period after it
    const periodId = `acquisition-period-${crypto.randomUUID()}`;
    await db.insert(schema.vacationAcquisitionPeriods).values({
      id: periodId,
      organizationId,
      employeeId: employee.id,
      acquisitionStart: "2025-01-01",
      acquisitionEnd: "2025-12-31",
      concessionStart: "2026-01-01",
      concessionEnd: "2026-12-31",
      daysEntitled: 30,
      daysUsed: 0,
      status: "available",
    });

    const result = await AcquisitionPeriodService.updatePeriodStatuses();
    expect(result.generated).toBeGreaterThanOrEqual(1);

    // Verify next period was created
    const periods = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employee.id),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      )
      .orderBy(schema.vacationAcquisitionPeriods.acquisitionStart);

    expect(periods.length).toBe(2);
    // Next period should start day after last acquisitionEnd
    expect(periods[1].acquisitionStart).toBe("2026-01-01");
    expect(periods[1].status).toBe("pending");
  });
});
