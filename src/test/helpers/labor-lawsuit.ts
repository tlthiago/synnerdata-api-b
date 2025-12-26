import type { LaborLawsuitData } from "@/modules/organization/labor-lawsuits/labor-lawsuit.model";
import { LaborLawsuitService } from "@/modules/organization/labor-lawsuits/labor-lawsuit.service";
import { createTestEmployee } from "./employee";
import { faker } from "./faker";

type LaborLawsuitOverrides = {
  employeeId?: string;
  processNumber?: string;
  court?: string;
  filingDate?: string;
  knowledgeDate?: string;
  plaintiff?: string;
  defendant?: string;
  plaintiffLawyer?: string;
  defendantLawyer?: string;
  description?: string;
  claimAmount?: number;
  progress?: string;
  decision?: string;
  conclusionDate?: string;
  appeals?: string;
  costsExpenses?: number;
};

type CreateTestLaborLawsuitOptions = {
  organizationId: string;
  userId: string;
} & LaborLawsuitOverrides;

function generateProcessNumber(): string {
  const seq = faker.string.numeric(7);
  const digito = faker.string.numeric(2);
  const ano = faker.date.recent({ days: 365 }).getFullYear();
  const justica = "5";
  const tribunal = faker.string.numeric(2);
  const origem = faker.string.numeric(4);
  return `${seq}-${digito}.${ano}.${justica}.${tribunal}.${origem}`;
}

export async function createTestLaborLawsuit(
  options: CreateTestLaborLawsuitOptions
): Promise<LaborLawsuitData> {
  const { organizationId, userId, employeeId, ...overrides } = options;

  let finalEmployeeId = employeeId;
  if (!finalEmployeeId) {
    const { employee } = await createTestEmployee({ organizationId, userId });
    finalEmployeeId = employee.id;
  }

  const lawsuit = await LaborLawsuitService.create({
    organizationId,
    userId,
    employeeId: finalEmployeeId,
    processNumber: overrides.processNumber ?? generateProcessNumber(),
    court:
      overrides.court ??
      faker.helpers.arrayElement([
        "1ª Vara do Trabalho de São Paulo",
        "2ª Vara do Trabalho do Rio de Janeiro",
        "Tribunal Regional do Trabalho da 2ª Região",
        "Vara do Trabalho de Campinas",
        "3ª Vara do Trabalho de Belo Horizonte",
      ]),
    filingDate:
      overrides.filingDate ??
      faker.date.recent({ days: 180 }).toISOString().split("T")[0],
    knowledgeDate:
      overrides.knowledgeDate ??
      faker.date.recent({ days: 200 }).toISOString().split("T")[0],
    plaintiff: overrides.plaintiff ?? faker.person.fullName(),
    defendant:
      overrides.defendant ??
      faker.helpers.arrayElement([
        "Empresa ABC Ltda",
        "Indústria XYZ S.A.",
        "Comércio Beta Ltda",
        "Serviços Gama Eireli",
      ]),
    plaintiffLawyer:
      overrides.plaintiffLawyer ?? `Dr. ${faker.person.fullName()}`,
    defendantLawyer:
      overrides.defendantLawyer ?? `Dra. ${faker.person.fullName()}`,
    description:
      overrides.description ??
      faker.helpers.arrayElement([
        "Reclamação trabalhista por verbas rescisórias",
        "Ação por horas extras não pagas",
        "Processo de reconhecimento de vínculo empregatício",
        "Reclamação por danos morais",
        "Ação de equiparação salarial",
        "Processo por assédio moral",
      ]),
    claimAmount:
      overrides.claimAmount ??
      Number(faker.finance.amount({ min: 5000, max: 100_000, dec: 2 })),
    progress:
      overrides.progress ??
      faker.helpers.arrayElement([
        "Aguardando audiência inicial",
        "Audiência de conciliação realizada",
        "Em fase de instrução processual",
        "Aguardando sentença",
        "Recurso em andamento",
        undefined,
      ]),
    decision: overrides.decision,
    conclusionDate: overrides.conclusionDate,
    appeals: overrides.appeals,
    costsExpenses: overrides.costsExpenses,
  });

  return lawsuit;
}
