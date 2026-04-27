import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { AuditService } from "@/modules/audit/audit.service";
import {
  buildAuditChanges,
  IGNORED_AUDIT_FIELDS,
} from "@/modules/audit/pii-redaction";
import {
  ProjectAlreadyDeletedError,
  ProjectCnoAlreadyExistsError,
  ProjectEmployeeAlreadyExistsError,
  ProjectEmployeeNotAssignedError,
  ProjectEmployeeNotFoundError,
  ProjectNameAlreadyExistsError,
  ProjectNotFoundError,
} from "./errors";
import type {
  CreateProjectInput,
  DeletedProjectData,
  EmployeeAssignment,
  EmployeeData,
  ProjectData,
  UpdateProjectInput,
} from "./project.model";

const PROJECT_IGNORED_FIELDS = new Set([...IGNORED_AUDIT_FIELDS, "employees"]);

export abstract class ProjectService {
  private static async ensureNameNotExists(
    organizationId: string,
    name: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          sql`lower(${schema.projects.name}) = lower(${name})`,
          isNull(schema.projects.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new ProjectNameAlreadyExistsError(name);
    }
  }

  private static async ensureCnoNotExists(
    organizationId: string,
    cno: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.cno, cno),
          isNull(schema.projects.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new ProjectCnoAlreadyExistsError(cno);
    }
  }

  private static async getEmployees(
    projectId: string,
    organizationId: string
  ): Promise<EmployeeData[]> {
    const employees = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
      })
      .from(schema.projectEmployees)
      .innerJoin(
        schema.employees,
        eq(schema.projectEmployees.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.projectEmployees.projectId, projectId),
          eq(schema.projectEmployees.organizationId, organizationId),
          isNull(schema.projectEmployees.deletedAt),
          isNull(schema.employees.deletedAt)
        )
      )
      .orderBy(schema.employees.name);

    return employees;
  }

  private static async enrichProject(
    project: {
      id: string;
      organizationId: string;
      name: string;
      description: string;
      startDate: string;
      cno: string;
      createdAt: Date;
      updatedAt: Date;
    },
    organizationId: string
  ): Promise<ProjectData> {
    const employees = await ProjectService.getEmployees(
      project.id,
      organizationId
    );

    return {
      ...project,
      employees,
    };
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<ProjectData | null> {
    const [result] = await db
      .select({
        id: schema.projects.id,
        organizationId: schema.projects.organizationId,
        name: schema.projects.name,
        description: schema.projects.description,
        startDate: schema.projects.startDate,
        cno: schema.projects.cno,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.organizationId, organizationId),
          isNull(schema.projects.deletedAt)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return ProjectService.enrichProject(result, organizationId);
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    (ProjectData & { deletedAt: Date | null; deletedBy: string | null }) | null
  > {
    const [result] = await db
      .select({
        id: schema.projects.id,
        organizationId: schema.projects.organizationId,
        name: schema.projects.name,
        description: schema.projects.description,
        startDate: schema.projects.startDate,
        cno: schema.projects.cno,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
        deletedAt: schema.projects.deletedAt,
        deletedBy: schema.projects.deletedBy,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    const employees = await ProjectService.getEmployees(
      result.id,
      organizationId
    );

    return {
      ...result,
      employees,
    };
  }

  private static async verifyEmployee(
    employeeId: string,
    organizationId: string
  ): Promise<void> {
    const [employee] = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    if (!employee) {
      throw new ProjectEmployeeNotFoundError(employeeId);
    }
  }

  static async create(input: CreateProjectInput): Promise<ProjectData> {
    const { organizationId, userId, employeeIds, ...data } = input;

    await ProjectService.ensureNameNotExists(organizationId, data.name);
    await ProjectService.ensureCnoNotExists(organizationId, data.cno);

    // Verify all employees exist if provided
    if (employeeIds && employeeIds.length > 0) {
      for (const employeeId of employeeIds) {
        await ProjectService.verifyEmployee(employeeId, organizationId);
      }
    }

    const projectId = `project-${crypto.randomUUID()}`;

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: projectId,
        organizationId,
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        cno: data.cno,
        createdBy: userId,
      })
      .returning();

    // Add employees to the project
    if (employeeIds && employeeIds.length > 0) {
      for (const employeeId of employeeIds) {
        const [association] = await db
          .insert(schema.projectEmployees)
          .values({
            id: `project-employee-${crypto.randomUUID()}`,
            organizationId,
            projectId,
            employeeId,
            createdBy: userId,
          })
          .returning();

        await AuditService.log({
          action: "create",
          resource: "project_employee",
          resourceId: association.id,
          userId,
          organizationId,
          changes: buildAuditChanges({}, association),
        });
      }
    }

    await AuditService.log({
      action: "create",
      resource: "project",
      resourceId: project.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, project, {
        ignoredFields: PROJECT_IGNORED_FIELDS,
      }),
    });

    return ProjectService.enrichProject(
      {
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        description: project.description,
        startDate: project.startDate,
        cno: project.cno,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
      organizationId
    );
  }

  static async findAll(organizationId: string): Promise<ProjectData[]> {
    const results = await db
      .select({
        id: schema.projects.id,
        organizationId: schema.projects.organizationId,
        name: schema.projects.name,
        description: schema.projects.description,
        startDate: schema.projects.startDate,
        cno: schema.projects.cno,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          isNull(schema.projects.deletedAt)
        )
      )
      .orderBy(desc(schema.projects.startDate));

    const enrichedProjects: ProjectData[] = [];
    for (const project of results) {
      const enriched = await ProjectService.enrichProject(
        project,
        organizationId
      );
      enrichedProjects.push(enriched);
    }

    return enrichedProjects;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<ProjectData> {
    const project = await ProjectService.findById(id, organizationId);
    if (!project) {
      throw new ProjectNotFoundError(id);
    }
    return project;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateProjectInput
  ): Promise<ProjectData> {
    const { userId, ...data } = input;

    const existing = await ProjectService.findById(id, organizationId);
    if (!existing) {
      throw new ProjectNotFoundError(id);
    }

    if (data.name !== undefined) {
      await ProjectService.ensureNameNotExists(organizationId, data.name, id);
    }
    if (data.cno !== undefined) {
      await ProjectService.ensureCnoNotExists(organizationId, data.cno, id);
    }

    const updateData = ProjectService.buildUpdateData(data, userId);

    const [updated] = await db
      .update(schema.projects)
      .set(updateData)
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "project",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        ignoredFields: PROJECT_IGNORED_FIELDS,
      }),
    });

    return ProjectService.findByIdOrThrow(id, organizationId);
  }

  private static buildUpdateData(
    data: Omit<UpdateProjectInput, "userId">,
    userId: string
  ): Record<string, unknown> {
    const updateData: Record<string, unknown> = { updatedBy: userId };

    const fields = ["name", "description", "startDate", "cno"] as const;

    for (const field of fields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    return updateData;
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedProjectData> {
    const existing = await ProjectService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new ProjectNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new ProjectAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.projects)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.projects.id, id),
          eq(schema.projects.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "project",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        {
          ignoredFields: PROJECT_IGNORED_FIELDS,
        }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    };
  }

  // M2M Operations

  static async getProjectEmployees(
    projectId: string,
    organizationId: string
  ): Promise<EmployeeData[]> {
    const project = await ProjectService.findById(projectId, organizationId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    return ProjectService.getEmployees(projectId, organizationId);
  }

  static async addEmployee(
    projectId: string,
    employeeId: string,
    organizationId: string,
    userId: string
  ): Promise<EmployeeAssignment> {
    // Verify project exists
    const project = await ProjectService.findById(projectId, organizationId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Verify employee exists
    await ProjectService.verifyEmployee(employeeId, organizationId);

    // Check if association already exists (active)
    const [existing] = await db
      .select()
      .from(schema.projectEmployees)
      .where(
        and(
          eq(schema.projectEmployees.projectId, projectId),
          eq(schema.projectEmployees.employeeId, employeeId),
          eq(schema.projectEmployees.organizationId, organizationId),
          isNull(schema.projectEmployees.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      throw new ProjectEmployeeAlreadyExistsError(projectId, employeeId);
    }

    const [association] = await db
      .insert(schema.projectEmployees)
      .values({
        id: `project-employee-${crypto.randomUUID()}`,
        organizationId,
        projectId,
        employeeId,
        createdBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "project_employee",
      resourceId: association.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, association),
    });

    return {
      projectId: association.projectId,
      employeeId: association.employeeId,
      createdAt: association.createdAt,
    };
  }

  static async removeEmployee(
    projectId: string,
    employeeId: string,
    organizationId: string,
    userId: string
  ): Promise<void> {
    // Verify project exists
    const project = await ProjectService.findById(projectId, organizationId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Find active association
    const [association] = await db
      .select()
      .from(schema.projectEmployees)
      .where(
        and(
          eq(schema.projectEmployees.projectId, projectId),
          eq(schema.projectEmployees.employeeId, employeeId),
          eq(schema.projectEmployees.organizationId, organizationId),
          isNull(schema.projectEmployees.deletedAt)
        )
      )
      .limit(1);

    if (!association) {
      throw new ProjectEmployeeNotAssignedError(projectId, employeeId);
    }

    // Soft delete the association
    const [removed] = await db
      .update(schema.projectEmployees)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(eq(schema.projectEmployees.id, association.id))
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "project_employee",
      resourceId: removed.id,
      userId,
      organizationId,
      changes: buildAuditChanges(association, {}),
    });
  }
}
