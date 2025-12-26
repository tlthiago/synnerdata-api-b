import type { TerminationData } from "@/modules/occurrences/terminations/termination.model";
import { TerminationService } from "@/modules/occurrences/terminations/termination.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";

type TerminationOverrides = {
  employeeId?: string;
  terminationDate?: string;
  type?:
    | "RESIGNATION"
    | "DISMISSAL_WITH_CAUSE"
    | "DISMISSAL_WITHOUT_CAUSE"
    | "MUTUAL_AGREEMENT"
    | "CONTRACT_END";
  reason?: string;
  noticePeriodDays?: number;
  noticePeriodWorked?: boolean;
  lastWorkingDay?: string;
  notes?: string;
};

type CreateTestTerminationOptions = {
  organizationId: string;
  userId: string;
} & TerminationOverrides;

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateTerminationDate(): string {
  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - faker.number.int({ min: 1, max: 90 }));
  return formatDate(pastDate);
}

function generateLastWorkingDay(terminationDate: string): string {
  const termDate = new Date(terminationDate);
  const lastDay = new Date(termDate);
  lastDay.setDate(termDate.getDate() + faker.number.int({ min: 0, max: 30 }));

  const today = new Date();
  if (lastDay > today) {
    return formatDate(today);
  }

  return formatDate(lastDay);
}

export async function createTestTermination(
  options: CreateTestTerminationOptions
): Promise<TerminationData> {
  const { organizationId, userId, ...overrides } = options;

  let employeeId = overrides.employeeId;

  if (!employeeId) {
    const { employee } = await createTestEmployee({ organizationId, userId });
    employeeId = employee.id;
  }

  const terminationDate =
    overrides.terminationDate ?? generateTerminationDate();
  const lastWorkingDay =
    overrides.lastWorkingDay ?? generateLastWorkingDay(terminationDate);

  return TerminationService.create({
    organizationId,
    userId,
    employeeId,
    terminationDate,
    type:
      overrides.type ??
      faker.helpers.arrayElement([
        "RESIGNATION",
        "DISMISSAL_WITHOUT_CAUSE",
        "MUTUAL_AGREEMENT",
      ] as const),
    reason: overrides.reason,
    noticePeriodDays: overrides.noticePeriodDays,
    noticePeriodWorked: overrides.noticePeriodWorked ?? false,
    lastWorkingDay,
    notes: overrides.notes,
  });
}

type CreateMultipleTerminationsOptions = {
  organizationId: string;
  userId: string;
  count: number;
};

export async function createTestTerminations(
  options: CreateMultipleTerminationsOptions
): Promise<TerminationData[]> {
  const { organizationId, userId, count } = options;
  const results: TerminationData[] = [];

  for (let i = 0; i < count; i++) {
    const termination = await createTestTermination({ organizationId, userId });
    results.push(termination);
  }

  return results;
}
