import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { createTestApp } from "@/test/helpers/app";
import { createTestEmployee } from "@/test/helpers/employee";
import { createTestUserWithOrganization } from "@/test/helpers/user";
import { AcquisitionPeriodService } from "../acquisition-period.service";

describe("AcquisitionPeriodService.generateForEmployee", () => {
  beforeAll(() => {
    createTestApp();
  });

  test("should generate periods from hireDate to today", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2023-01-15",
    });

    await AcquisitionPeriodService.generateForEmployee(
      employee.id,
      organizationId,
      "2023-01-15"
    );

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

    // Should have multiple periods (from 2023-01-15 to today 2026-03-06)
    // Period 1: 2023-01-15 to 2024-01-14 (available or expired)
    // Period 2: 2024-01-15 to 2025-01-14 (available or expired)
    // Period 3: 2025-01-15 to 2026-01-14 (available)
    // Period 4: 2026-01-15 to 2027-01-14 (pending)
    expect(periods.length).toBeGreaterThanOrEqual(3);

    // First period should have correct dates
    const first = periods[0];
    expect(first.acquisitionStart).toBe("2023-01-15");
    expect(first.acquisitionEnd).toBe("2024-01-14");
    expect(first.concessionStart).toBe("2024-01-15");
    expect(first.concessionEnd).toBe("2025-01-14");
    expect(first.daysEntitled).toBe(30);
    expect(first.daysUsed).toBe(0);

    // Last period should be pending
    const last = periods.at(-1);
    expect(last?.status).toBe("pending");

    // All non-last periods should not be pending
    for (const p of periods.slice(0, -1)) {
      expect(p.status).not.toBe("pending");
    }
  });

  test("should set expired status when concession period has passed", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2020-06-01",
    });

    await AcquisitionPeriodService.generateForEmployee(
      employee.id,
      organizationId,
      "2020-06-01"
    );

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

    // First period: 2020-06-01 to 2021-05-31, concession ends 2022-05-31 -> expired
    expect(periods[0].status).toBe("expired");
  });

  test("should default daysEntitled to 30", async () => {
    const { organizationId, user } = await createTestUserWithOrganization({
      emailVerified: true,
    });
    const { employee } = await createTestEmployee({
      organizationId,
      userId: user.id,
      hireDate: "2025-06-01",
    });

    await AcquisitionPeriodService.generateForEmployee(
      employee.id,
      organizationId,
      "2025-06-01"
    );

    const periods = await db
      .select()
      .from(schema.vacationAcquisitionPeriods)
      .where(
        and(
          eq(schema.vacationAcquisitionPeriods.employeeId, employee.id),
          isNull(schema.vacationAcquisitionPeriods.deletedAt)
        )
      );

    expect(periods.length).toBe(1);
    expect(periods[0].daysEntitled).toBe(30);
    expect(periods[0].status).toBe("pending");
  });
});
