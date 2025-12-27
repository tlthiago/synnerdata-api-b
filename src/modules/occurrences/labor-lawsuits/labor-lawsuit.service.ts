import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  LaborLawsuitAlreadyDeletedError,
  LaborLawsuitEmployeeNotFoundError,
  LaborLawsuitNotFoundError,
} from "./errors";
import type {
  CreateLaborLawsuitInput,
  DeletedLaborLawsuitData,
  LaborLawsuitData,
  UpdateLaborLawsuitInput,
} from "./labor-lawsuit.model";

export abstract class LaborLawsuitService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<LaborLawsuitData | null> {
    const [result] = await db
      .select({
        id: schema.laborLawsuits.id,
        organizationId: schema.laborLawsuits.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        processNumber: schema.laborLawsuits.processNumber,
        court: schema.laborLawsuits.court,
        filingDate: schema.laborLawsuits.filingDate,
        knowledgeDate: schema.laborLawsuits.knowledgeDate,
        plaintiff: schema.laborLawsuits.plaintiff,
        defendant: schema.laborLawsuits.defendant,
        plaintiffLawyer: schema.laborLawsuits.plaintiffLawyer,
        defendantLawyer: schema.laborLawsuits.defendantLawyer,
        description: schema.laborLawsuits.description,
        claimAmount: schema.laborLawsuits.claimAmount,
        progress: schema.laborLawsuits.progress,
        decision: schema.laborLawsuits.decision,
        conclusionDate: schema.laborLawsuits.conclusionDate,
        appeals: schema.laborLawsuits.appeals,
        costsExpenses: schema.laborLawsuits.costsExpenses,
        createdAt: schema.laborLawsuits.createdAt,
        updatedAt: schema.laborLawsuits.updatedAt,
      })
      .from(schema.laborLawsuits)
      .innerJoin(
        schema.employees,
        eq(schema.laborLawsuits.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.laborLawsuits.id, id),
          eq(schema.laborLawsuits.organizationId, organizationId),
          isNull(schema.laborLawsuits.deletedAt)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      ...result,
      claimAmount: result.claimAmount ? Number(result.claimAmount) : null,
      costsExpenses: result.costsExpenses ? Number(result.costsExpenses) : null,
    } as LaborLawsuitData;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    | (LaborLawsuitData & { deletedAt: Date | null; deletedBy: string | null })
    | null
  > {
    const [result] = await db
      .select({
        id: schema.laborLawsuits.id,
        organizationId: schema.laborLawsuits.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        processNumber: schema.laborLawsuits.processNumber,
        court: schema.laborLawsuits.court,
        filingDate: schema.laborLawsuits.filingDate,
        knowledgeDate: schema.laborLawsuits.knowledgeDate,
        plaintiff: schema.laborLawsuits.plaintiff,
        defendant: schema.laborLawsuits.defendant,
        plaintiffLawyer: schema.laborLawsuits.plaintiffLawyer,
        defendantLawyer: schema.laborLawsuits.defendantLawyer,
        description: schema.laborLawsuits.description,
        claimAmount: schema.laborLawsuits.claimAmount,
        progress: schema.laborLawsuits.progress,
        decision: schema.laborLawsuits.decision,
        conclusionDate: schema.laborLawsuits.conclusionDate,
        appeals: schema.laborLawsuits.appeals,
        costsExpenses: schema.laborLawsuits.costsExpenses,
        createdAt: schema.laborLawsuits.createdAt,
        updatedAt: schema.laborLawsuits.updatedAt,
        deletedAt: schema.laborLawsuits.deletedAt,
        deletedBy: schema.laborLawsuits.deletedBy,
      })
      .from(schema.laborLawsuits)
      .innerJoin(
        schema.employees,
        eq(schema.laborLawsuits.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.laborLawsuits.id, id),
          eq(schema.laborLawsuits.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!result) {
      return null;
    }

    return {
      ...result,
      claimAmount: result.claimAmount ? Number(result.claimAmount) : null,
      costsExpenses: result.costsExpenses ? Number(result.costsExpenses) : null,
    };
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
      throw new LaborLawsuitEmployeeNotFoundError(employeeId);
    }

    return employee;
  }

  static async create(
    input: CreateLaborLawsuitInput
  ): Promise<LaborLawsuitData> {
    const { organizationId, userId, ...data } = input;

    const employee = await LaborLawsuitService.getEmployeeReference(
      data.employeeId,
      organizationId
    );

    const lawsuitId = `labor-lawsuit-${crypto.randomUUID()}`;

    const [lawsuit] = await db
      .insert(schema.laborLawsuits)
      .values({
        id: lawsuitId,
        organizationId,
        employeeId: data.employeeId,
        processNumber: data.processNumber,
        court: data.court,
        filingDate: data.filingDate,
        knowledgeDate: data.knowledgeDate,
        plaintiff: data.plaintiff,
        defendant: data.defendant,
        plaintiffLawyer: data.plaintiffLawyer,
        defendantLawyer: data.defendantLawyer,
        description: data.description,
        claimAmount: data.claimAmount?.toString(),
        progress: data.progress,
        decision: data.decision,
        conclusionDate: data.conclusionDate,
        appeals: data.appeals,
        costsExpenses: data.costsExpenses?.toString(),
        createdBy: userId,
      })
      .returning();

    return {
      id: lawsuit.id,
      organizationId: lawsuit.organizationId,
      employee,
      processNumber: lawsuit.processNumber,
      court: lawsuit.court,
      filingDate: lawsuit.filingDate,
      knowledgeDate: lawsuit.knowledgeDate,
      plaintiff: lawsuit.plaintiff,
      defendant: lawsuit.defendant,
      plaintiffLawyer: lawsuit.plaintiffLawyer,
      defendantLawyer: lawsuit.defendantLawyer,
      description: lawsuit.description,
      claimAmount: lawsuit.claimAmount ? Number(lawsuit.claimAmount) : null,
      progress: lawsuit.progress,
      decision: lawsuit.decision,
      conclusionDate: lawsuit.conclusionDate,
      appeals: lawsuit.appeals,
      costsExpenses: lawsuit.costsExpenses
        ? Number(lawsuit.costsExpenses)
        : null,
      createdAt: lawsuit.createdAt,
      updatedAt: lawsuit.updatedAt,
    } as LaborLawsuitData;
  }

  static async findAll(
    organizationId: string,
    employeeId?: string
  ): Promise<LaborLawsuitData[]> {
    const conditions = [
      eq(schema.laborLawsuits.organizationId, organizationId),
      isNull(schema.laborLawsuits.deletedAt),
    ];

    if (employeeId) {
      conditions.push(eq(schema.laborLawsuits.employeeId, employeeId));
    }

    const results = await db
      .select({
        id: schema.laborLawsuits.id,
        organizationId: schema.laborLawsuits.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        processNumber: schema.laborLawsuits.processNumber,
        court: schema.laborLawsuits.court,
        filingDate: schema.laborLawsuits.filingDate,
        knowledgeDate: schema.laborLawsuits.knowledgeDate,
        plaintiff: schema.laborLawsuits.plaintiff,
        defendant: schema.laborLawsuits.defendant,
        plaintiffLawyer: schema.laborLawsuits.plaintiffLawyer,
        defendantLawyer: schema.laborLawsuits.defendantLawyer,
        description: schema.laborLawsuits.description,
        claimAmount: schema.laborLawsuits.claimAmount,
        progress: schema.laborLawsuits.progress,
        decision: schema.laborLawsuits.decision,
        conclusionDate: schema.laborLawsuits.conclusionDate,
        appeals: schema.laborLawsuits.appeals,
        costsExpenses: schema.laborLawsuits.costsExpenses,
        createdAt: schema.laborLawsuits.createdAt,
        updatedAt: schema.laborLawsuits.updatedAt,
      })
      .from(schema.laborLawsuits)
      .innerJoin(
        schema.employees,
        eq(schema.laborLawsuits.employeeId, schema.employees.id)
      )
      .where(and(...conditions))
      .orderBy(desc(schema.laborLawsuits.filingDate));

    return results.map((result) => ({
      ...result,
      claimAmount: result.claimAmount ? Number(result.claimAmount) : null,
      costsExpenses: result.costsExpenses ? Number(result.costsExpenses) : null,
    })) as LaborLawsuitData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<LaborLawsuitData> {
    const lawsuit = await LaborLawsuitService.findById(id, organizationId);
    if (!lawsuit) {
      throw new LaborLawsuitNotFoundError(id);
    }
    return lawsuit;
  }

  private static buildUpdateData(
    data: Omit<UpdateLaborLawsuitInput, "userId">,
    userId: string
  ): Record<string, unknown> {
    const updateData: Record<string, unknown> = { updatedBy: userId };

    const simpleFields = [
      "processNumber",
      "court",
      "filingDate",
      "knowledgeDate",
      "plaintiff",
      "defendant",
      "plaintiffLawyer",
      "defendantLawyer",
      "description",
      "progress",
      "decision",
      "conclusionDate",
      "appeals",
    ] as const;

    for (const field of simpleFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (data.claimAmount !== undefined) {
      updateData.claimAmount = data.claimAmount?.toString();
    }
    if (data.costsExpenses !== undefined) {
      updateData.costsExpenses = data.costsExpenses?.toString();
    }

    return updateData;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateLaborLawsuitInput
  ): Promise<LaborLawsuitData> {
    const { userId, ...data } = input;

    const existing = await LaborLawsuitService.findById(id, organizationId);
    if (!existing) {
      throw new LaborLawsuitNotFoundError(id);
    }

    const updateData = LaborLawsuitService.buildUpdateData(data, userId);

    await db
      .update(schema.laborLawsuits)
      .set(updateData)
      .where(
        and(
          eq(schema.laborLawsuits.id, id),
          eq(schema.laborLawsuits.organizationId, organizationId)
        )
      );

    return LaborLawsuitService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedLaborLawsuitData> {
    const existing = await LaborLawsuitService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new LaborLawsuitNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new LaborLawsuitAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.laborLawsuits)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.laborLawsuits.id, id),
          eq(schema.laborLawsuits.organizationId, organizationId)
        )
      )
      .returning();

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedLaborLawsuitData;
  }
}
