import type { VacationData } from "@/modules/occurrences/vacations/vacation.model";
import { VacationService } from "@/modules/occurrences/vacations/vacation.service";
import { createTestAcquisitionPeriod } from "./acquisition-period";
import { faker } from "./faker";

type VacationOverrides = {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  daysUsed?: number;
  acquisitionPeriodId?: string;
  status?: "scheduled" | "in_progress" | "completed" | "canceled";
  notes?: string;
};

type CreateTestVacationOptions = {
  organizationId: string;
  userId: string;
  employeeId: string;
} & VacationOverrides;

export async function createTestVacation(
  options: CreateTestVacationOptions
): Promise<VacationData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  let acquisitionPeriodId = overrides.acquisitionPeriodId;
  if (!acquisitionPeriodId) {
    const period = await createTestAcquisitionPeriod({
      organizationId,
      userId,
      employeeId,
      status: "available",
    });
    acquisitionPeriodId = period.id;
  }

  const startDate =
    overrides.startDate ??
    faker.date.future({ years: 1 }).toISOString().split("T")[0];
  const endDate =
    overrides.endDate ??
    (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + faker.number.int({ min: 5, max: 30 }));
      return d.toISOString().split("T")[0];
    })();

  return VacationService.create({
    organizationId,
    userId,
    employeeId,
    startDate,
    endDate,
    daysUsed: overrides.daysUsed ?? 0,
    acquisitionPeriodId,
    status: overrides.status ?? "scheduled",
    notes: overrides.notes,
  });
}
