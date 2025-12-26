import type { VacationData } from "@/modules/occurrences/vacations/vacation.model";
import { VacationService } from "@/modules/occurrences/vacations/vacation.service";
import { faker } from "./faker";

type VacationOverrides = {
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  daysTotal?: number;
  daysUsed?: number;
  acquisitionPeriodStart?: string;
  acquisitionPeriodEnd?: string;
  status?: "scheduled" | "in_progress" | "completed" | "canceled";
  notes?: string;
};

type CreateTestVacationOptions = {
  organizationId: string;
  userId: string;
  employeeId: string;
} & VacationOverrides;

function generateVacationDates() {
  const acquisitionStart = faker.date.past({ years: 1 });
  const acquisitionEnd = new Date(acquisitionStart);
  acquisitionEnd.setFullYear(acquisitionEnd.getFullYear() + 1);

  const startDate = faker.date.future({ years: 1, refDate: new Date() });
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + faker.number.int({ min: 5, max: 30 }));

  return {
    acquisitionPeriodStart: acquisitionStart.toISOString().split("T")[0],
    acquisitionPeriodEnd: acquisitionEnd.toISOString().split("T")[0],
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

export function createTestVacation(
  options: CreateTestVacationOptions
): Promise<VacationData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  const dates = generateVacationDates();
  const daysTotal = overrides.daysTotal ?? 30;
  const daysUsed = overrides.daysUsed ?? 0;

  return VacationService.create({
    organizationId,
    userId,
    employeeId,
    startDate: overrides.startDate ?? dates.startDate,
    endDate: overrides.endDate ?? dates.endDate,
    daysTotal,
    daysUsed,
    acquisitionPeriodStart:
      overrides.acquisitionPeriodStart ?? dates.acquisitionPeriodStart,
    acquisitionPeriodEnd:
      overrides.acquisitionPeriodEnd ?? dates.acquisitionPeriodEnd,
    status: overrides.status ?? "scheduled",
    notes: overrides.notes,
  });
}
