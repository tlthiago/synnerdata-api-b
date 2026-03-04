import type { CpfAnalysisData } from "@/modules/occurrences/cpf-analyses/cpf-analysis.model";
import { CpfAnalysisService } from "@/modules/occurrences/cpf-analyses/cpf-analysis.service";
import { faker } from "./faker";

type CpfAnalysisOverrides = {
  employeeId?: string;
  analysisDate?: string;
  status?: "pending" | "approved" | "rejected" | "review";
  score?: number;
  riskLevel?: "low" | "medium" | "high";
  observations?: string;
  externalReference?: string;
};

type CreateTestCpfAnalysisOptions = {
  organizationId: string;
  userId: string;
  employeeId: string;
} & CpfAnalysisOverrides;

export async function createTestCpfAnalysis(
  options: CreateTestCpfAnalysisOptions
): Promise<CpfAnalysisData> {
  const {
    organizationId,
    userId,
    employeeId,
    analysisDate,
    status,
    score,
    riskLevel,
    observations,
    externalReference,
  } = options;

  const pastDate = faker.date.past({ years: 1 });
  const formattedDate = pastDate.toISOString().split("T")[0];

  return await CpfAnalysisService.create({
    organizationId,
    userId,
    employeeId,
    analysisDate: analysisDate ?? formattedDate,
    status: status ?? faker.helpers.arrayElement(["approved", "pending"]),
    score: score ?? faker.number.int({ min: 300, max: 900 }),
    riskLevel:
      riskLevel ?? faker.helpers.arrayElement(["low", "medium", "high"]),
    observations:
      observations ?? faker.helpers.maybe(() => faker.lorem.sentence()),
    externalReference:
      externalReference ??
      faker.helpers.maybe(() => faker.string.alphanumeric(10)),
  });
}
