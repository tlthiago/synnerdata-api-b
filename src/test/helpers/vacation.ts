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

export async function createTestVacation(
  options: CreateTestVacationOptions
): Promise<VacationData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

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
