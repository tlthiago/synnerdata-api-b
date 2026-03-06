import { calculateDaysBetween } from "@/lib/schemas/date-helpers";
import type { MedicalCertificateData } from "@/modules/occurrences/medical-certificates/medical-certificates.model";
import { MedicalCertificateService } from "@/modules/occurrences/medical-certificates/medical-certificates.service";
import { faker } from "./faker";

type MedicalCertificateOverrides = {
  startDate?: string;
  endDate?: string;
  daysOff?: number;
  cid?: string;
  doctorName?: string;
  doctorCrm?: string;
  notes?: string;
};

type CreateTestMedicalCertificateOptions = {
  organizationId: string;
  userId: string;
  employeeId: string;
} & MedicalCertificateOverrides;

function generateDefaultDates(daysOffOverride?: number) {
  const startDate = faker.date.recent({ days: 7 });
  const daysOff = daysOffOverride ?? faker.number.int({ min: 1, max: 15 });
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + daysOff - 1);

  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    daysOff,
  };
}

function generateCid() {
  const chapter = faker.string.alpha({ length: 1, casing: "upper" });
  const code = faker.number
    .int({ min: 0, max: 99 })
    .toString()
    .padStart(2, "0");
  const subcode = faker.number.int({ min: 0, max: 9 });
  return `${chapter}${code}.${subcode}`;
}

/**
 * Creates a test medical certificate using the MedicalCertificateService.
 * Uses faker with pt-BR locale for realistic Brazilian data.
 *
 * Requires an employeeId. If dates are not provided, generates realistic values.
 * When daysOff is provided without dates, generates dates that match the daysOff value.
 * When dates are provided without daysOff, calculates daysOff from the dates.
 */
export async function createTestMedicalCertificate(
  options: CreateTestMedicalCertificateOptions
): Promise<MedicalCertificateData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  let startDate: string;
  let endDate: string;
  let daysOff: number;

  if (overrides.startDate && overrides.endDate) {
    startDate = overrides.startDate;
    endDate = overrides.endDate;
    daysOff = overrides.daysOff ?? calculateDaysBetween(startDate, endDate);
  } else {
    const defaults = generateDefaultDates(overrides.daysOff);
    startDate = overrides.startDate ?? defaults.startDate;
    endDate = overrides.endDate ?? defaults.endDate;
    daysOff = overrides.daysOff ?? defaults.daysOff;
  }

  return await MedicalCertificateService.create({
    organizationId,
    userId,
    employeeId,
    startDate,
    endDate,
    daysOff,
    cid: overrides.cid ?? generateCid(),
    doctorName: overrides.doctorName ?? faker.person.fullName(),
    doctorCrm: overrides.doctorCrm ?? faker.string.numeric(6),
    notes: overrides.notes,
  });
}
