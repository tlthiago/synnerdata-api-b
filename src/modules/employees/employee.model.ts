import { z } from "zod";
import { isValidCPF } from "@/lib/document-validators";
import { successResponseSchema } from "@/lib/responses/response.types";
import { isFutureDate } from "@/lib/schemas/date-helpers";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

// Enum values for validation
const contractTypeValues = ["CLT", "PJ"] as const;
const educationLevelValues = [
  "ELEMENTARY",
  "HIGH_SCHOOL",
  "BACHELOR",
  "POST_GRADUATE",
  "MASTER",
  "DOCTORATE",
] as const;
const genderValues = ["MALE", "FEMALE", "NOT_DECLARED", "OTHER"] as const;
const maritalStatusValues = [
  "SINGLE",
  "MARRIED",
  "DIVORCED",
  "WIDOWED",
  "STABLE_UNION",
  "SEPARATED",
] as const;
const workShiftValues = [
  "TWELVE_THIRTY_SIX",
  "SIX_ONE",
  "FIVE_TWO",
  "FOUR_THREE",
] as const;
const employeeStatusValues = [
  "ACTIVE",
  "TERMINATED",
  "ON_LEAVE",
  "ON_VACATION",
  "VACATION_SCHEDULED",
  "TERMINATION_SCHEDULED",
] as const;
const disabilityTypeValues = [
  "AUDITIVA",
  "VISUAL",
  "FISICA",
  "INTELECTUAL",
  "MENTAL",
  "MULTIPLA",
] as const;

const employeeFieldsSchema = z.object({
  // Personal Data
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .describe("Nome completo"),
  email: z.string().email("Email inválido").optional().describe("Email"),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
    .optional()
    .describe("Telefone fixo"),
  mobile: z
    .string()
    .regex(/^\d{10,11}$/, "Celular deve ter 10 ou 11 dígitos")
    .optional()
    .describe("Celular"),
  birthDate: z
    .string()
    .date("Data de nascimento deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de nascimento não pode ser no futuro",
    })
    .describe("Data de nascimento"),
  gender: z.enum(genderValues).describe("Sexo"),
  maritalStatus: z.enum(maritalStatusValues).describe("Estado civil"),
  birthplace: z
    .string()
    .max(100, "Naturalidade deve ter no máximo 100 caracteres")
    .optional()
    .describe("Naturalidade"),
  nationality: z
    .string()
    .min(1, "Nacionalidade é obrigatória")
    .max(100, "Nacionalidade deve ter no máximo 100 caracteres")
    .describe("Nacionalidade"),
  height: z
    .number()
    .min(0.5, "Altura mínima é 0.5m")
    .max(3, "Altura máxima é 3m")
    .optional()
    .describe("Altura em metros"),
  weight: z
    .number()
    .min(10, "Peso mínimo é 10kg")
    .max(500, "Peso máximo é 500kg")
    .optional()
    .describe("Peso em kg"),
  fatherName: z
    .string()
    .max(100, "Nome do pai deve ter no máximo 100 caracteres")
    .optional()
    .describe("Nome do pai"),
  motherName: z
    .string()
    .max(100, "Nome da mãe deve ter no máximo 100 caracteres")
    .optional()
    .describe("Nome da mãe"),

  // Documents
  cpf: z
    .string()
    .regex(/^\d{11}$/, "CPF deve ter 11 dígitos")
    .refine((val) => isValidCPF(val), "CPF inválido")
    .describe("CPF (11 dígitos)"),
  identityCard: z
    .string()
    .max(20, "RG deve ter no máximo 20 caracteres")
    .optional()
    .describe("RG"),
  pis: z
    .string()
    .regex(/^\d{11}$/, "PIS deve ter 11 dígitos")
    .optional()
    .describe("PIS (11 dígitos)"),
  workPermitNumber: z
    .string()
    .max(10, "Número da CTPS deve ter no máximo 10 caracteres")
    .optional()
    .describe("Número da CTPS"),
  workPermitSeries: z
    .string()
    .max(10, "Série da CTPS deve ter no máximo 10 caracteres")
    .optional()
    .describe("Série da CTPS"),
  militaryCertificate: z
    .string()
    .max(20, "Certificado de reservista deve ter no máximo 20 caracteres")
    .optional()
    .describe("Certificado de reservista"),

  // Address
  street: z
    .string()
    .min(1, "Rua é obrigatória")
    .max(255, "Rua deve ter no máximo 255 caracteres")
    .describe("Rua"),
  streetNumber: z
    .string()
    .min(1, "Número é obrigatório")
    .max(10, "Número deve ter no máximo 10 caracteres")
    .describe("Número"),
  complement: z
    .string()
    .max(100, "Complemento deve ter no máximo 100 caracteres")
    .optional()
    .describe("Complemento"),
  neighborhood: z
    .string()
    .min(1, "Bairro é obrigatório")
    .max(100, "Bairro deve ter no máximo 100 caracteres")
    .describe("Bairro"),
  city: z
    .string()
    .min(1, "Cidade é obrigatória")
    .max(100, "Cidade deve ter no máximo 100 caracteres")
    .describe("Cidade"),
  state: z.string().length(2, "Estado deve ter 2 caracteres").describe("UF"),
  zipCode: z
    .string()
    .regex(/^\d{8}$/, "CEP deve ter 8 dígitos")
    .describe("CEP (8 dígitos)"),
  latitude: z
    .number()
    .min(-90, "Latitude mínima é -90")
    .max(90, "Latitude máxima é 90")
    .optional()
    .describe("Latitude"),
  longitude: z
    .number()
    .min(-180, "Longitude mínima é -180")
    .max(180, "Longitude máxima é 180")
    .optional()
    .describe("Longitude"),

  // Employment
  hireDate: z
    .string()
    .date("Data de admissão deve ser uma data válida")
    .refine((val) => !isFutureDate(val), {
      message: "Data de admissão não pode ser no futuro",
    })
    .describe("Data de admissão"),
  contractType: z.enum(contractTypeValues).describe("Tipo de contrato"),
  salary: z
    .number()
    .min(0, "Salário não pode ser negativo")
    .describe("Salário"),
  manager: z
    .string()
    .max(255, "Nome do gestor deve ter no máximo 255 caracteres")
    .optional()
    .describe("Nome do gestor"),

  // Foreign Keys
  branchId: z.string().optional().describe("ID da filial"),
  sectorId: z.string().min(1, "Setor é obrigatório").describe("ID do setor"),
  costCenterId: z.string().optional().describe("ID do centro de custo"),
  jobPositionId: z
    .string()
    .min(1, "Cargo é obrigatório")
    .describe("ID do cargo"),
  jobClassificationId: z
    .string()
    .min(1, "CBO é obrigatório")
    .describe("ID do CBO"),

  // Work Schedule
  workShift: z.enum(workShiftValues).optional().describe("Escala de trabalho"),
  weeklyHours: z
    .number()
    .min(1, "Carga horária mínima é 1 hora")
    .max(168, "Carga horária máxima é 168 horas")
    .describe("Carga horária semanal"),
  busCount: z
    .number()
    .int()
    .min(0, "Quantidade de ônibus não pode ser negativa")
    .optional()
    .describe("Quantidade de ônibus"),

  // Benefits
  mealAllowance: z
    .number()
    .min(0, "Vale alimentação não pode ser negativo")
    .optional()
    .describe("Vale alimentação"),
  transportAllowance: z
    .number()
    .min(0, "Vale transporte não pode ser negativo")
    .optional()
    .describe("Vale transporte"),
  healthInsurance: z
    .number()
    .min(0, "Plano de saúde não pode ser negativo")
    .optional()
    .describe("Plano de saúde"),

  // Education and Special Needs
  educationLevel: z
    .enum(educationLevelValues)
    .optional()
    .describe("Grau de instrução"),
  hasSpecialNeeds: z
    .boolean()
    .optional()
    .describe("Possui necessidades especiais"),
  disabilityType: z
    .enum(disabilityTypeValues)
    .optional()
    .describe("Tipo de deficiência"),

  // Family
  hasChildren: z.boolean().optional().describe("Possui filhos"),
  childrenCount: z
    .number()
    .int()
    .min(0, "Quantidade de filhos não pode ser negativa")
    .optional()
    .describe("Quantidade de filhos"),
  hasChildrenUnder21: z
    .boolean()
    .optional()
    .describe("Possui filhos menores de 21"),

  // Health and Exams
  lastHealthExamDate: z
    .string()
    .date("Data do último ASO deve ser uma data válida")
    .optional()
    .describe("Data do último ASO"),
  admissionExamDate: z
    .string()
    .date("Data do exame admissional deve ser uma data válida")
    .optional()
    .describe("Data do exame admissional"),
  terminationExamDate: z
    .string()
    .date("Data do exame demissional deve ser uma data válida")
    .optional()
    .describe("Data do exame demissional"),

  // Acquisition Period (manual seed)
  acquisitionPeriodStart: z
    .string()
    .date("Início do período aquisitivo deve ser uma data válida")
    .optional()
    .describe("Início do período aquisitivo (YYYY-MM-DD)"),
  acquisitionPeriodEnd: z
    .string()
    .date("Fim do período aquisitivo deve ser uma data válida")
    .optional()
    .describe("Fim do período aquisitivo (YYYY-MM-DD)"),
});

export const createEmployeeSchema = employeeFieldsSchema.refine(
  (data) => {
    const hasStart = data.acquisitionPeriodStart !== undefined;
    const hasEnd = data.acquisitionPeriodEnd !== undefined;
    return hasStart === hasEnd;
  },
  {
    message: "Início e fim do período aquisitivo devem ser informados juntos",
    path: ["acquisitionPeriodEnd"],
  }
);

export const updateEmployeeSchema = employeeFieldsSchema.partial().extend({
  // Nullable fields: replicate validation chain with .nullable().optional()
  // for JSON Merge Patch convention (null = clear field)

  // Personal Data
  email: z.string().email("Email inválido").nullable().optional(),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
    .nullable()
    .optional(),
  mobile: z
    .string()
    .regex(/^\d{10,11}$/, "Celular deve ter 10 ou 11 dígitos")
    .nullable()
    .optional(),
  birthplace: z
    .string()
    .max(100, "Naturalidade deve ter no máximo 100 caracteres")
    .nullable()
    .optional(),
  height: z
    .number()
    .min(0.5, "Altura mínima é 0.5m")
    .max(3, "Altura máxima é 3m")
    .nullable()
    .optional(),
  weight: z
    .number()
    .min(10, "Peso mínimo é 10kg")
    .max(500, "Peso máximo é 500kg")
    .nullable()
    .optional(),
  fatherName: z
    .string()
    .max(100, "Nome do pai deve ter no máximo 100 caracteres")
    .nullable()
    .optional(),
  motherName: z
    .string()
    .max(100, "Nome da mãe deve ter no máximo 100 caracteres")
    .nullable()
    .optional(),

  // Documents
  identityCard: z
    .string()
    .max(20, "RG deve ter no máximo 20 caracteres")
    .nullable()
    .optional(),
  pis: z
    .string()
    .regex(/^\d{11}$/, "PIS deve ter 11 dígitos")
    .nullable()
    .optional(),
  workPermitNumber: z
    .string()
    .max(10, "Número da CTPS deve ter no máximo 10 caracteres")
    .nullable()
    .optional(),
  workPermitSeries: z
    .string()
    .max(10, "Série da CTPS deve ter no máximo 10 caracteres")
    .nullable()
    .optional(),
  militaryCertificate: z
    .string()
    .max(20, "Certificado de reservista deve ter no máximo 20 caracteres")
    .nullable()
    .optional(),

  // Address
  complement: z
    .string()
    .max(100, "Complemento deve ter no máximo 100 caracteres")
    .nullable()
    .optional(),
  latitude: z
    .number()
    .min(-90, "Latitude mínima é -90")
    .max(90, "Latitude máxima é 90")
    .nullable()
    .optional(),
  longitude: z
    .number()
    .min(-180, "Longitude mínima é -180")
    .max(180, "Longitude máxima é 180")
    .nullable()
    .optional(),

  // Employment
  manager: z
    .string()
    .max(255, "Nome do gestor deve ter no máximo 255 caracteres")
    .nullable()
    .optional(),

  // Foreign Keys
  branchId: z.string().nullable().optional(),
  costCenterId: z.string().nullable().optional(),

  // Work Schedule
  workShift: z.enum(workShiftValues).nullable().optional(),
  busCount: z
    .number()
    .int()
    .min(0, "Quantidade de ônibus não pode ser negativa")
    .nullable()
    .optional(),

  // Benefits
  mealAllowance: z
    .number()
    .min(0, "Vale alimentação não pode ser negativo")
    .nullable()
    .optional(),
  transportAllowance: z
    .number()
    .min(0, "Vale transporte não pode ser negativo")
    .nullable()
    .optional(),
  healthInsurance: z
    .number()
    .min(0, "Plano de saúde não pode ser negativo")
    .nullable()
    .optional(),

  // Education and Special Needs
  educationLevel: z.enum(educationLevelValues).nullable().optional(),
  disabilityType: z.enum(disabilityTypeValues).nullable().optional(),

  // Family
  childrenCount: z
    .number()
    .int()
    .min(0, "Quantidade de filhos não pode ser negativa")
    .nullable()
    .optional(),
  hasChildrenUnder21: z.boolean().nullable().optional(),

  // Health and Exams
  lastHealthExamDate: z
    .string()
    .date("Data do último ASO deve ser uma data válida")
    .nullable()
    .optional(),
  admissionExamDate: z
    .string()
    .date("Data do exame admissional deve ser uma data válida")
    .nullable()
    .optional(),
  terminationExamDate: z
    .string()
    .date("Data do exame demissional deve ser uma data válida")
    .nullable()
    .optional(),

  // Acquisition Period
  acquisitionPeriodStart: z
    .string()
    .date("Início do período aquisitivo deve ser uma data válida")
    .nullable()
    .optional(),
  acquisitionPeriodEnd: z
    .string()
    .date("Fim do período aquisitivo deve ser uma data válida")
    .nullable()
    .optional(),
});

export const updateEmployeeStatusSchema = z.object({
  status: z.enum(employeeStatusValues).describe("Status do funcionário"),
});

export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do funcionário"),
});

// Data schemas for response
const employeeDataSchema = z.object({
  id: z.string().describe("ID do funcionário"),
  organizationId: z.string().describe("ID da organização"),

  // Personal Data
  name: z.string().describe("Nome completo"),
  email: z.string().nullable().describe("Email"),
  phone: z.string().nullable().describe("Telefone fixo"),
  mobile: z.string().nullable().describe("Celular"),
  birthDate: z.string().describe("Data de nascimento"),
  gender: z.enum(genderValues).describe("Sexo"),
  maritalStatus: z.enum(maritalStatusValues).describe("Estado civil"),
  birthplace: z.string().nullable().describe("Naturalidade"),
  nationality: z.string().describe("Nacionalidade"),
  height: z.string().nullable().describe("Altura em metros"),
  weight: z.string().nullable().describe("Peso em kg"),
  fatherName: z.string().nullable().describe("Nome do pai"),
  motherName: z.string().nullable().describe("Nome da mãe"),

  // Documents
  cpf: z.string().describe("CPF"),
  identityCard: z.string().nullable().describe("RG"),
  pis: z.string().nullable().describe("PIS"),
  workPermitNumber: z.string().nullable().describe("Número da CTPS"),
  workPermitSeries: z.string().nullable().describe("Série da CTPS"),
  militaryCertificate: z
    .string()
    .nullable()
    .describe("Certificado de reservista"),

  // Address
  street: z.string().describe("Rua"),
  streetNumber: z.string().describe("Número"),
  complement: z.string().nullable().describe("Complemento"),
  neighborhood: z.string().describe("Bairro"),
  city: z.string().describe("Cidade"),
  state: z.string().describe("UF"),
  zipCode: z.string().describe("CEP"),
  latitude: z.string().nullable().describe("Latitude"),
  longitude: z.string().nullable().describe("Longitude"),

  // Employment
  hireDate: z.string().describe("Data de admissão"),
  contractType: z.enum(contractTypeValues).describe("Tipo de contrato"),
  salary: z.string().describe("Salário"),
  status: z.enum(employeeStatusValues).describe("Status do funcionário"),
  manager: z.string().nullable().describe("Nome do gestor"),

  // Foreign Keys (expanded objects)
  branch: entityReferenceSchema.nullable().describe("Filial"),
  sector: entityReferenceSchema.describe("Setor"),
  costCenter: entityReferenceSchema.nullable().describe("Centro de custo"),
  jobPosition: entityReferenceSchema.describe("Cargo"),
  jobClassification: entityReferenceSchema.describe("CBO"),

  // Work Schedule
  workShift: z.enum(workShiftValues).nullable().describe("Escala de trabalho"),
  weeklyHours: z.string().describe("Carga horária semanal"),
  busCount: z.number().nullable().describe("Quantidade de ônibus"),

  // Benefits
  mealAllowance: z.string().nullable().describe("Vale alimentação"),
  transportAllowance: z.string().nullable().describe("Vale transporte"),
  healthInsurance: z.string().nullable().describe("Plano de saúde"),

  // Education and Special Needs
  educationLevel: z
    .enum(educationLevelValues)
    .nullable()
    .describe("Grau de instrução"),
  hasSpecialNeeds: z.boolean().describe("Possui necessidades especiais"),
  disabilityType: z
    .enum(disabilityTypeValues)
    .nullable()
    .describe("Tipo de deficiência"),

  // Family
  hasChildren: z.boolean().describe("Possui filhos"),
  childrenCount: z.number().nullable().describe("Quantidade de filhos"),
  hasChildrenUnder21: z
    .boolean()
    .nullable()
    .describe("Possui filhos menores de 21"),

  // Health and Exams
  lastHealthExamDate: z.string().nullable().describe("Data do último ASO"),
  admissionExamDate: z
    .string()
    .nullable()
    .describe("Data do exame admissional"),
  terminationExamDate: z
    .string()
    .nullable()
    .describe("Data do exame demissional"),
  probation1ExpiryDate: z
    .string()
    .nullable()
    .describe("Vencimento experiência 1"),
  probation2ExpiryDate: z
    .string()
    .nullable()
    .describe("Vencimento experiência 2"),

  // Acquisition Period (manual seed)
  acquisitionPeriodStart: z
    .string()
    .nullable()
    .describe("Início do período aquisitivo"),
  acquisitionPeriodEnd: z
    .string()
    .nullable()
    .describe("Fim do período aquisitivo"),

  // Vacation
  lastAcquisitionPeriod: z
    .object({
      start: z.string().describe("Início do período aquisitivo"),
      end: z.string().describe("Fim do período aquisitivo"),
    })
    .nullable()
    .describe("Último período aquisitivo de férias"),

  // Audit
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
  createdBy: entityReferenceSchema.describe("Usuário que criou o funcionário"),
  updatedBy: entityReferenceSchema.describe(
    "Usuário que atualizou o funcionário pela última vez"
  ),
});

const deletedEmployeeDataSchema = employeeDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
});

const employeeListDataSchema = z.array(employeeDataSchema);

// Response schemas
export const createEmployeeResponseSchema =
  successResponseSchema(employeeDataSchema);
export const getEmployeeResponseSchema =
  successResponseSchema(employeeDataSchema);
export const updateEmployeeResponseSchema =
  successResponseSchema(employeeDataSchema);
export const deleteEmployeeResponseSchema = successResponseSchema(
  deletedEmployeeDataSchema
);
export const listEmployeesResponseSchema = successResponseSchema(
  employeeListDataSchema
);

// Types
export type CreateEmployee = z.infer<typeof createEmployeeSchema>;
export type CreateEmployeeInput = CreateEmployee & {
  organizationId: string;
  userId: string;
};

export type UpdateEmployee = z.infer<typeof updateEmployeeSchema>;
export type UpdateEmployeeInput = UpdateEmployee & {
  userId: string;
};

export type UpdateEmployeeStatus = z.infer<typeof updateEmployeeStatusSchema>;
export type UpdateEmployeeStatusInput = UpdateEmployeeStatus & {
  userId: string;
};

export type EmployeeData = z.infer<typeof employeeDataSchema>;
export type DeletedEmployeeData = z.infer<typeof deletedEmployeeDataSchema>;
