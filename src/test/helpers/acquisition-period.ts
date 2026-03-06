import type { AcquisitionPeriodData } from "@/modules/occurrences/vacations/acquisition-periods/acquisition-period.model";
import { AcquisitionPeriodService } from "@/modules/occurrences/vacations/acquisition-periods/acquisition-period.service";

type CreateTestAcquisitionPeriodOptions = {
  organizationId: string;
  userId: string;
  employeeId: string;
  acquisitionStart?: string;
  acquisitionEnd?: string;
  concessionStart?: string;
  concessionEnd?: string;
  daysEntitled?: number;
  status?: "pending" | "available" | "used" | "expired";
  notes?: string;
};

export function createTestAcquisitionPeriod(
  options: CreateTestAcquisitionPeriodOptions
): Promise<AcquisitionPeriodData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  return AcquisitionPeriodService.create({
    organizationId,
    userId,
    employeeId,
    acquisitionStart: overrides.acquisitionStart ?? "2024-01-01",
    acquisitionEnd: overrides.acquisitionEnd ?? "2024-12-31",
    concessionStart: overrides.concessionStart ?? "2025-01-01",
    concessionEnd: overrides.concessionEnd ?? "2025-12-31",
    daysEntitled: overrides.daysEntitled ?? 30,
    status: overrides.status ?? "available",
    notes: overrides.notes,
  });
}
