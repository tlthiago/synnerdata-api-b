import { z } from "zod";
import { successResponseSchema } from "@/lib/responses/response.types";
import { entityReferenceSchema } from "@/lib/schemas/relationships";

const isFutureDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

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
] as const;

export const createEmployeeSchema = z.object({
  // Personal Data
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .describe("Nome completo"),
  email: z.string().email("Email inválido").describe("Email"),
  phone: z
    .string()
    .regex(/^\d{10,11}$/, "Telefone deve ter 10 ou 11 dígitos")
    .optional()
    .describe("Telefone fixo"),
  mobile: z
    .string()
    .regex(/^\d{10,11}$/, "Celular deve ter 10 ou 11 dígitos")
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
    .min(1, "Naturalidade é obrigatória")
    .max(100, "Naturalidade deve ter no máximo 100 caracteres")
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
    .min(1, "Nome da mãe é obrigatório")
    .max(100, "Nome da mãe deve ter no máximo 100 caracteres")
    .describe("Nome da mãe"),

  // Documents
  cpf: z
    .string()
    .regex(/^\d{11}$/, "CPF deve ter 11 dígitos")
    .describe("CPF (11 dígitos)"),
  identityCard: z
    .string()
    .min(1, "RG é obrigatório")
    .max(20, "RG deve ter no máximo 20 caracteres")
    .describe("RG"),
  pis: z
    .string()
    .regex(/^\d{11}$/, "PIS deve ter 11 dígitos")
    .describe("PIS (11 dígitos)"),
  workPermitNumber: z
    .string()
    .min(1, "Número da CTPS é obrigatório")
    .max(10, "Número da CTPS deve ter no máximo 10 caracteres")
    .describe("Número da CTPS"),
  workPermitSeries: z
    .string()
    .min(1, "Série da CTPS é obrigatória")
    .max(10, "Série da CTPS deve ter no máximo 10 caracteres")
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
  workShift: z.enum(workShiftValues).describe("Escala de trabalho"),
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

  // Education and Special Needs
  educationLevel: z.enum(educationLevelValues).describe("Grau de instrução"),
  hasSpecialNeeds: z.boolean().describe("Possui necessidades especiais"),
  disabilityType: z
    .string()
    .max(255, "Tipo de deficiência deve ter no máximo 255 caracteres")
    .optional()
    .describe("Tipo de deficiência"),

  // Family
  hasChildren: z.boolean().describe("Possui filhos"),
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
  probation1ExpiryDate: z
    .string()
    .date("Data de vencimento da experiência 1 deve ser uma data válida")
    .optional()
    .describe("Vencimento experiência 1"),
  probation2ExpiryDate: z
    .string()
    .date("Data de vencimento da experiência 2 deve ser uma data válida")
    .optional()
    .describe("Vencimento experiência 2"),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

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
  email: z.string().describe("Email"),
  phone: z.string().nullable().describe("Telefone fixo"),
  mobile: z.string().describe("Celular"),
  birthDate: z.string().describe("Data de nascimento"),
  gender: z.enum(genderValues).describe("Sexo"),
  maritalStatus: z.enum(maritalStatusValues).describe("Estado civil"),
  birthplace: z.string().describe("Naturalidade"),
  nationality: z.string().describe("Nacionalidade"),
  height: z.string().nullable().describe("Altura em metros"),
  weight: z.string().nullable().describe("Peso em kg"),
  fatherName: z.string().nullable().describe("Nome do pai"),
  motherName: z.string().describe("Nome da mãe"),

  // Documents
  cpf: z.string().describe("CPF"),
  identityCard: z.string().describe("RG"),
  pis: z.string().describe("PIS"),
  workPermitNumber: z.string().describe("Número da CTPS"),
  workPermitSeries: z.string().describe("Série da CTPS"),
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
  workShift: z.enum(workShiftValues).describe("Escala de trabalho"),
  weeklyHours: z.string().describe("Carga horária semanal"),
  busCount: z.number().nullable().describe("Quantidade de ônibus"),

  // Benefits
  mealAllowance: z.string().nullable().describe("Vale alimentação"),
  transportAllowance: z.string().nullable().describe("Vale transporte"),

  // Education and Special Needs
  educationLevel: z.enum(educationLevelValues).describe("Grau de instrução"),
  hasSpecialNeeds: z.boolean().describe("Possui necessidades especiais"),
  disabilityType: z.string().nullable().describe("Tipo de deficiência"),

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

  // Audit
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

const deletedEmployeeDataSchema = employeeDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
  deletedBy: z.string().nullable().describe("ID do usuário que excluiu"),
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
