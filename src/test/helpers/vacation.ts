import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  addDays,
  resolveNextCycle,
} from "@/modules/occurrences/vacations/period-calculation";
import type { VacationData } from "@/modules/occurrences/vacations/vacation.model";
import { VacationService } from "@/modules/occurrences/vacations/vacation.service";
import { faker } from "./faker";

type VacationOverrides = {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  daysEntitled?: number;
  daysUsed?: number;
  status?: "scheduled" | "in_progress" | "completed" | "canceled";
  notes?: string;
};

type CreateTestVacationOptions = {
  organizationId: string;
  userId: string;
  employeeId: string;
} & VacationOverrides;

async function resolveDefaultStartDate(
  organizationId: string,
  employeeId: string
): Promise<string> {
  const [employee] = await db
    .select({ hireDate: schema.employees.hireDate })
    .from(schema.employees)
    .where(
      and(
        eq(schema.employees.id, employeeId),
        eq(schema.employees.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!employee) {
    throw new Error(`Test helper: employee ${employeeId} not found`);
  }

  const rows = await db
    .select({
      acquisitionPeriodStart: sql<string>`${schema.vacations.acquisitionPeriodStart}`,
      daysEntitled: schema.vacations.daysEntitled,
    })
    .from(schema.vacations)
    .where(
      and(
        eq(schema.vacations.organizationId, organizationId),
        eq(schema.vacations.employeeId, employeeId),
        sql`${schema.vacations.status} != 'canceled'`,
        isNull(schema.vacations.deletedAt),
        sql`${schema.vacations.acquisitionPeriodStart} IS NOT NULL`
      )
    );

  const cycle = resolveNextCycle({
    hireDate: employee.hireDate,
    vacationsInCycles: rows.map((row) => ({
      acquisitionPeriodStart: row.acquisitionPeriodStart,
      daysEntitled: row.daysEntitled,
    })),
  });

  return addDays(cycle.concessivePeriodStart, 30);
}

export async function createTestVacation(
  options: CreateTestVacationOptions
): Promise<VacationData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  const startDate =
    overrides.startDate ??
    (await resolveDefaultStartDate(organizationId, employeeId));
  const endDate =
    overrides.endDate ??
    (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + faker.number.int({ min: 5, max: 14 }));
      return d.toISOString().split("T")[0];
    })();

  return await VacationService.create({
    organizationId,
    userId,
    employeeId,
    startDate,
    endDate,
    daysEntitled:
      overrides.daysEntitled ??
      Math.round(
        (new Date(`${endDate}T00:00:00Z`).getTime() -
          new Date(`${startDate}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1,
    daysUsed: overrides.daysUsed ?? 0,
    status: overrides.status ?? "scheduled",
    notes: overrides.notes,
  });
}
