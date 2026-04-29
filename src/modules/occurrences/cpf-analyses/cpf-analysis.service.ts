import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { ensureEmployeeActive } from "@/modules/employees/status";
import type {
  CpfAnalysisData,
  CreateCpfAnalysisInput,
  DeletedCpfAnalysisData,
  UpdateCpfAnalysisInput,
} from "./cpf-analysis.model";
import {
  CpfAnalysisAlreadyDeletedError,
  CpfAnalysisDuplicateDateError,
  CpfAnalysisInvalidEmployeeError,
  CpfAnalysisNotFoundError,
} from "./errors";

export abstract class CpfAnalysisService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<CpfAnalysisData | null> {
    const [result] = await db
      .select({
        id: schema.cpfAnalyses.id,
        organizationId: schema.cpfAnalyses.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        analysisDate: schema.cpfAnalyses.analysisDate,
        status: schema.cpfAnalyses.status,
        score: schema.cpfAnalyses.score,
        riskLevel: schema.cpfAnalyses.riskLevel,
        observations: schema.cpfAnalyses.observations,
        externalReference: schema.cpfAnalyses.externalReference,
        createdAt: schema.cpfAnalyses.createdAt,
        updatedAt: schema.cpfAnalyses.updatedAt,
      })
      .from(schema.cpfAnalyses)
      .innerJoin(
        schema.employees,
        eq(schema.cpfAnalyses.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.cpfAnalyses.id, id),
          eq(schema.cpfAnalyses.organizationId, organizationId),
          isNull(schema.cpfAnalyses.deletedAt)
        )
      )
      .limit(1);

    return (result as CpfAnalysisData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(CpfAnalysisData & { deletedAt: Date | null }) | null> {
    const [result] = await db
      .select({
        id: schema.cpfAnalyses.id,
        organizationId: schema.cpfAnalyses.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        analysisDate: schema.cpfAnalyses.analysisDate,
        status: schema.cpfAnalyses.status,
        score: schema.cpfAnalyses.score,
        riskLevel: schema.cpfAnalyses.riskLevel,
        observations: schema.cpfAnalyses.observations,
        externalReference: schema.cpfAnalyses.externalReference,
        createdAt: schema.cpfAnalyses.createdAt,
        updatedAt: schema.cpfAnalyses.updatedAt,
        deletedAt: schema.cpfAnalyses.deletedAt,
      })
      .from(schema.cpfAnalyses)
      .innerJoin(
        schema.employees,
        eq(schema.cpfAnalyses.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.cpfAnalyses.id, id),
          eq(schema.cpfAnalyses.organizationId, organizationId)
        )
      )
      .limit(1);

    return result ?? null;
  }

  private static async getEmployeeReference(
    employeeId: string,
    organizationId: string
  ): Promise<{ id: string; name: string }> {
    const [employee] = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
      })
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
      throw new CpfAnalysisInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  private static async ensureNoDuplicateDate(options: {
    organizationId: string;
    employeeId: string;
    analysisDate: string;
    excludeId?: string;
  }): Promise<void> {
    const { organizationId, employeeId, analysisDate, excludeId } = options;

    const [existing] = await db
      .select({ id: schema.cpfAnalyses.id })
      .from(schema.cpfAnalyses)
      .where(
        and(
          eq(schema.cpfAnalyses.organizationId, organizationId),
          eq(schema.cpfAnalyses.employeeId, employeeId),
          eq(schema.cpfAnalyses.analysisDate, analysisDate),
          isNull(schema.cpfAnalyses.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new CpfAnalysisDuplicateDateError(employeeId, analysisDate);
    }
  }

  static async create(input: CreateCpfAnalysisInput): Promise<CpfAnalysisData> {
    const { organizationId, userId, employeeId, ...data } = input;

    const employee = await CpfAnalysisService.getEmployeeReference(
      employeeId,
      organizationId
    );

    await ensureEmployeeActive(employeeId, organizationId);
    await CpfAnalysisService.ensureNoDuplicateDate({
      organizationId,
      employeeId,
      analysisDate: data.analysisDate,
    });

    const cpfAnalysisId = `cpf-analysis-${crypto.randomUUID()}`;

    const [cpfAnalysis] = await db
      .insert(schema.cpfAnalyses)
      .values({
        id: cpfAnalysisId,
        organizationId,
        employeeId,
        analysisDate: data.analysisDate,
        status: data.status,
        score: data.score ?? null,
        riskLevel: data.riskLevel ?? null,
        observations: data.observations ?? null,
        externalReference: data.externalReference ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    return {
      id: cpfAnalysis.id,
      organizationId: cpfAnalysis.organizationId,
      employee,
      analysisDate: cpfAnalysis.analysisDate,
      status: cpfAnalysis.status,
      score: cpfAnalysis.score,
      riskLevel: cpfAnalysis.riskLevel,
      observations: cpfAnalysis.observations,
      externalReference: cpfAnalysis.externalReference,
      createdAt: cpfAnalysis.createdAt,
      updatedAt: cpfAnalysis.updatedAt,
    } as CpfAnalysisData;
  }

  static async findAll(organizationId: string): Promise<CpfAnalysisData[]> {
    const results = await db
      .select({
        id: schema.cpfAnalyses.id,
        organizationId: schema.cpfAnalyses.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        analysisDate: schema.cpfAnalyses.analysisDate,
        status: schema.cpfAnalyses.status,
        score: schema.cpfAnalyses.score,
        riskLevel: schema.cpfAnalyses.riskLevel,
        observations: schema.cpfAnalyses.observations,
        externalReference: schema.cpfAnalyses.externalReference,
        createdAt: schema.cpfAnalyses.createdAt,
        updatedAt: schema.cpfAnalyses.updatedAt,
      })
      .from(schema.cpfAnalyses)
      .innerJoin(
        schema.employees,
        eq(schema.cpfAnalyses.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.cpfAnalyses.organizationId, organizationId),
          isNull(schema.cpfAnalyses.deletedAt)
        )
      )
      .orderBy(schema.cpfAnalyses.analysisDate);

    return results as CpfAnalysisData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<CpfAnalysisData> {
    const cpfAnalysis = await CpfAnalysisService.findById(id, organizationId);
    if (!cpfAnalysis) {
      throw new CpfAnalysisNotFoundError(id);
    }
    return cpfAnalysis;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateCpfAnalysisInput
  ): Promise<CpfAnalysisData> {
    const { userId, ...data } = input;

    const existing = await CpfAnalysisService.findById(id, organizationId);
    if (!existing) {
      throw new CpfAnalysisNotFoundError(id);
    }

    if (
      data.analysisDate !== undefined &&
      data.analysisDate !== existing.analysisDate
    ) {
      await CpfAnalysisService.ensureNoDuplicateDate({
        organizationId,
        employeeId: existing.employee.id,
        analysisDate: data.analysisDate,
        excludeId: id,
      });
    }

    await db
      .update(schema.cpfAnalyses)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.cpfAnalyses.id, id),
          eq(schema.cpfAnalyses.organizationId, organizationId)
        )
      );

    return CpfAnalysisService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedCpfAnalysisData> {
    const existing = await CpfAnalysisService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new CpfAnalysisNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new CpfAnalysisAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.cpfAnalyses)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.cpfAnalyses.id, id),
          eq(schema.cpfAnalyses.organizationId, organizationId)
        )
      )
      .returning();

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
    } as DeletedCpfAnalysisData;
  }
}
