import { z } from "zod";

// Employee reference in responses
const employeeDataSchema = z.object({
  id: z.string().describe("ID do funcionário"),
  name: z.string().describe("Nome do funcionário"),
});

// Create project schema
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres"),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .max(255, "Descrição deve ter no máximo 255 caracteres"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  cno: z.string().length(12, "CNO deve ter exatamente 12 caracteres"),
  employeeIds: z.array(z.string().min(1)).optional(),
});

// Update project schema
export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(255, "Nome deve ter no máximo 255 caracteres")
    .optional(),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .max(255, "Descrição deve ter no máximo 255 caracteres")
    .optional(),
  startDate: z.string().min(1).optional(),
  cno: z
    .string()
    .length(12, "CNO deve ter exatamente 12 caracteres")
    .optional(),
});

// Add employee schema
export const addEmployeeSchema = z.object({
  employeeId: z.string().min(1, "ID do funcionário é obrigatório"),
});

// Param schemas
export const idParamSchema = z.object({
  id: z.string().min(1).describe("ID do projeto"),
});

export const employeeIdParamsSchema = z.object({
  id: z.string().min(1).describe("ID do projeto"),
  employeeId: z.string().min(1).describe("ID do funcionário"),
});

// Project data schema (response)
export const projectDataSchema = z.object({
  id: z.string().describe("ID do projeto"),
  organizationId: z.string().describe("ID da organização"),
  name: z.string().describe("Nome do projeto"),
  description: z.string().describe("Descrição do projeto"),
  startDate: z.string().describe("Data de início"),
  cno: z.string().describe("Número CNO"),
  employees: z.array(employeeDataSchema).describe("Funcionários do projeto"),
  createdAt: z.coerce.date().describe("Data de criação"),
  updatedAt: z.coerce.date().describe("Data de atualização"),
});

// Deleted project data schema (response)
export const deletedProjectDataSchema = projectDataSchema.extend({
  deletedAt: z.coerce.date().describe("Data de exclusão"),
});

// Employee assignment response schema
export const employeeAssignmentSchema = z.object({
  projectId: z.string().describe("ID do projeto"),
  employeeId: z.string().describe("ID do funcionário"),
  createdAt: z.coerce.date().describe("Data de vinculação"),
});

// Response schemas
export const createProjectResponseSchema = z.object({
  success: z.literal(true),
  data: projectDataSchema,
});

export const listProjectsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(projectDataSchema),
});

export const getProjectResponseSchema = z.object({
  success: z.literal(true),
  data: projectDataSchema,
});

export const updateProjectResponseSchema = z.object({
  success: z.literal(true),
  data: projectDataSchema,
});

export const deleteProjectResponseSchema = z.object({
  success: z.literal(true),
  data: deletedProjectDataSchema,
});

export const listProjectEmployeesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(employeeDataSchema),
});

export const addEmployeeResponseSchema = z.object({
  success: z.literal(true),
  data: employeeAssignmentSchema,
});

export const removeEmployeeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ success: z.literal(true) }),
});

// Types
export type CreateProject = z.infer<typeof createProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
export type AddEmployee = z.infer<typeof addEmployeeSchema>;
export type ProjectData = z.infer<typeof projectDataSchema>;
export type DeletedProjectData = z.infer<typeof deletedProjectDataSchema>;
export type EmployeeData = z.infer<typeof employeeDataSchema>;
export type EmployeeAssignment = z.infer<typeof employeeAssignmentSchema>;

// Input types with context
export interface CreateProjectInput extends CreateProject {
  organizationId: string;
  userId: string;
}

export interface UpdateProjectInput extends UpdateProject {
  userId: string;
}
