import { aliasedTable, and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { ensureEmployeeActive } from "@/lib/helpers/employee-status";
import type { EntityReference } from "@/lib/schemas/relationships";
import { EmployeeService } from "@/modules/employees/employee.service";
import { JobPositionService } from "@/modules/organizations/job-positions/job-position.service";
import {
  InvalidPromotionDataError,
  PromotionAlreadyDeletedError,
  PromotionDuplicateDateError,
  PromotionNotFoundError,
  PromotionNotLatestError,
} from "./errors";
import type {
  CreatePromotionInput,
  DeletedPromotionData,
  PromotionCreateResult,
  PromotionData,
  UpdatePromotion,
  UpdatePromotionInput,
} from "./promotion.model";

const previousJobPositionTable = aliasedTable(
  schema.jobPositions,
  "previous_job_position"
);
const newJobPositionTable = aliasedTable(
  schema.jobPositions,
  "new_job_position"
);

export abstract class PromotionService {
  private static async getEmployeeReference(
    employeeId: string,
    organizationId: string
  ): Promise<EntityReference> {
    const [employee] = await db
      .select({ id: schema.employees.id, name: schema.employees.name })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    return employee;
  }

  private static async getJobPositionReference(
    jobPositionId: string,
    organizationId: string
  ): Promise<EntityReference> {
    const [jobPosition] = await db
      .select({ id: schema.jobPositions.id, name: schema.jobPositions.name })
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.id, jobPositionId),
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .limit(1);

    return jobPosition;
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<PromotionData | null> {
    const [result] = await db
      .select({
        id: schema.promotions.id,
        organizationId: schema.promotions.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        promotionDate: schema.promotions.promotionDate,
        previousJobPosition: {
          id: previousJobPositionTable.id,
          name: previousJobPositionTable.name,
        },
        newJobPosition: {
          id: newJobPositionTable.id,
          name: newJobPositionTable.name,
        },
        previousSalary: schema.promotions.previousSalary,
        newSalary: schema.promotions.newSalary,
        reason: schema.promotions.reason,
        notes: schema.promotions.notes,
        createdAt: schema.promotions.createdAt,
        updatedAt: schema.promotions.updatedAt,
        createdBy: schema.promotions.createdBy,
        updatedBy: schema.promotions.updatedBy,
      })
      .from(schema.promotions)
      .innerJoin(
        schema.employees,
        eq(schema.promotions.employeeId, schema.employees.id)
      )
      .innerJoin(
        previousJobPositionTable,
        eq(schema.promotions.previousJobPositionId, previousJobPositionTable.id)
      )
      .innerJoin(
        newJobPositionTable,
        eq(schema.promotions.newJobPositionId, newJobPositionTable.id)
      )
      .where(
        and(
          eq(schema.promotions.id, id),
          eq(schema.promotions.organizationId, organizationId),
          isNull(schema.promotions.deletedAt)
        )
      )
      .limit(1);

    return (result as PromotionData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(PromotionData & { deletedAt: Date | null }) | null> {
    const [result] = await db
      .select({
        id: schema.promotions.id,
        organizationId: schema.promotions.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        promotionDate: schema.promotions.promotionDate,
        previousJobPosition: {
          id: previousJobPositionTable.id,
          name: previousJobPositionTable.name,
        },
        newJobPosition: {
          id: newJobPositionTable.id,
          name: newJobPositionTable.name,
        },
        previousSalary: schema.promotions.previousSalary,
        newSalary: schema.promotions.newSalary,
        reason: schema.promotions.reason,
        notes: schema.promotions.notes,
        createdAt: schema.promotions.createdAt,
        updatedAt: schema.promotions.updatedAt,
        createdBy: schema.promotions.createdBy,
        updatedBy: schema.promotions.updatedBy,
        deletedAt: schema.promotions.deletedAt,
        deletedBy: schema.promotions.deletedBy,
      })
      .from(schema.promotions)
      .innerJoin(
        schema.employees,
        eq(schema.promotions.employeeId, schema.employees.id)
      )
      .innerJoin(
        previousJobPositionTable,
        eq(schema.promotions.previousJobPositionId, previousJobPositionTable.id)
      )
      .innerJoin(
        newJobPositionTable,
        eq(schema.promotions.newJobPositionId, newJobPositionTable.id)
      )
      .where(
        and(
          eq(schema.promotions.id, id),
          eq(schema.promotions.organizationId, organizationId)
        )
      )
      .limit(1);

    return result ?? null;
  }

  private static buildUpdateData(
    data: UpdatePromotion,
    userId: string
  ): Record<string, unknown> {
    const updateData: Record<string, unknown> = {
      updatedBy: userId,
    };

    if (data.employeeId !== undefined) {
      updateData.employeeId = data.employeeId;
    }
    if (data.promotionDate !== undefined) {
      updateData.promotionDate = data.promotionDate;
    }
    if (data.previousJobPositionId !== undefined) {
      updateData.previousJobPositionId = data.previousJobPositionId;
    }
    if (data.newJobPositionId !== undefined) {
      updateData.newJobPositionId = data.newJobPositionId;
    }
    if (data.previousSalary !== undefined) {
      updateData.previousSalary = data.previousSalary.toString();
    }
    if (data.newSalary !== undefined) {
      updateData.newSalary = data.newSalary.toString();
    }
    if (data.reason !== undefined) {
      updateData.reason = data.reason;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    return updateData;
  }

  private static validateSalaryIncrease(
    previousSalary: number,
    newSalary: number
  ): void {
    if (newSalary <= previousSalary) {
      throw new InvalidPromotionDataError(
        "O novo salário deve ser maior que o salário anterior",
        { previousSalary, newSalary }
      );
    }
  }

  private static async ensureNoDuplicateDate(params: {
    organizationId: string;
    employeeId: string;
    promotionDate: string;
    excludeId?: string;
  }): Promise<void> {
    const { organizationId, employeeId, promotionDate, excludeId } = params;

    const [existing] = await db
      .select({ id: schema.promotions.id })
      .from(schema.promotions)
      .where(
        and(
          eq(schema.promotions.organizationId, organizationId),
          eq(schema.promotions.employeeId, employeeId),
          eq(schema.promotions.promotionDate, promotionDate),
          isNull(schema.promotions.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new PromotionDuplicateDateError(employeeId, promotionDate);
    }
  }

  private static async findLatestPromotionRaw(
    employeeId: string,
    organizationId: string,
    excludeId?: string
  ): Promise<{
    id: string;
    newSalary: string;
    newJobPositionId: string;
    promotionDate: string;
  } | null> {
    const { desc } = await import("drizzle-orm");

    const conditions = [
      eq(schema.promotions.employeeId, employeeId),
      eq(schema.promotions.organizationId, organizationId),
      isNull(schema.promotions.deletedAt),
    ];

    if (excludeId) {
      const { ne } = await import("drizzle-orm");
      conditions.push(ne(schema.promotions.id, excludeId));
    }

    const [result] = await db
      .select({
        id: schema.promotions.id,
        newSalary: schema.promotions.newSalary,
        newJobPositionId: schema.promotions.newJobPositionId,
        promotionDate: schema.promotions.promotionDate,
      })
      .from(schema.promotions)
      .where(and(...conditions))
      .orderBy(desc(schema.promotions.promotionDate))
      .limit(1);

    return result ?? null;
  }

  private static async syncEmployeeFromPromotion(params: {
    employeeId: string;
    organizationId: string;
    salary: string;
    jobPositionId: string;
    userId: string;
  }): Promise<void> {
    await db
      .update(schema.employees)
      .set({
        salary: params.salary,
        jobPositionId: params.jobPositionId,
        updatedBy: params.userId,
      })
      .where(
        and(
          eq(schema.employees.id, params.employeeId),
          eq(schema.employees.organizationId, params.organizationId)
        )
      );
  }

  private static async ensureIsLatestPromotion(
    promotionId: string,
    employeeId: string,
    organizationId: string
  ): Promise<void> {
    const latest = await PromotionService.findLatestPromotionRaw(
      employeeId,
      organizationId
    );

    if (latest && latest.id !== promotionId) {
      throw new PromotionNotLatestError(promotionId);
    }
  }

  static async create(
    input: CreatePromotionInput
  ): Promise<PromotionCreateResult> {
    const {
      organizationId,
      userId,
      employeeId,
      previousJobPositionId,
      newJobPositionId,
      promotionDate,
      previousSalary,
      newSalary,
      reason,
      notes,
    } = input;

    await EmployeeService.findByIdOrThrow(employeeId, organizationId);

    await ensureEmployeeActive(employeeId, organizationId);

    await JobPositionService.findByIdOrThrow(
      previousJobPositionId,
      organizationId
    );
    await JobPositionService.findByIdOrThrow(newJobPositionId, organizationId);

    if (previousJobPositionId === newJobPositionId) {
      throw new InvalidPromotionDataError(
        "O cargo anterior e o novo cargo não podem ser iguais",
        { previousJobPositionId, newJobPositionId }
      );
    }

    PromotionService.validateSalaryIncrease(previousSalary, newSalary);

    await PromotionService.ensureNoDuplicateDate({
      organizationId,
      employeeId,
      promotionDate,
    });

    const promotionId = `promotion-${crypto.randomUUID()}`;

    const [promotion] = await db
      .insert(schema.promotions)
      .values({
        id: promotionId,
        organizationId,
        employeeId,
        promotionDate,
        previousJobPositionId,
        newJobPositionId,
        previousSalary: previousSalary.toString(),
        newSalary: newSalary.toString(),
        reason: reason ?? null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

    // Sync employee if this is the latest promotion
    const latestPromotion = await PromotionService.findLatestPromotionRaw(
      employeeId,
      organizationId
    );

    const employeeSynced =
      !!latestPromotion && latestPromotion.id === promotionId;

    if (employeeSynced) {
      await PromotionService.syncEmployeeFromPromotion({
        employeeId,
        organizationId,
        salary: newSalary.toString(),
        jobPositionId: newJobPositionId,
        userId,
      });
    }

    const employee = await PromotionService.getEmployeeReference(
      employeeId,
      organizationId
    );
    const previousJobPosition = await PromotionService.getJobPositionReference(
      previousJobPositionId,
      organizationId
    );
    const newJobPosition = await PromotionService.getJobPositionReference(
      newJobPositionId,
      organizationId
    );

    return {
      data: {
        id: promotion.id,
        organizationId: promotion.organizationId,
        employee,
        promotionDate: promotion.promotionDate,
        previousJobPosition,
        newJobPosition,
        previousSalary: promotion.previousSalary,
        newSalary: promotion.newSalary,
        reason: promotion.reason,
        notes: promotion.notes,
        createdAt: promotion.createdAt,
        updatedAt: promotion.updatedAt,
        createdBy: promotion.createdBy,
        updatedBy: promotion.updatedBy,
      },
      employeeSynced,
    };
  }

  static async findAll(organizationId: string): Promise<PromotionData[]> {
    const promotions = await db
      .select({
        id: schema.promotions.id,
        organizationId: schema.promotions.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        promotionDate: schema.promotions.promotionDate,
        previousJobPosition: {
          id: previousJobPositionTable.id,
          name: previousJobPositionTable.name,
        },
        newJobPosition: {
          id: newJobPositionTable.id,
          name: newJobPositionTable.name,
        },
        previousSalary: schema.promotions.previousSalary,
        newSalary: schema.promotions.newSalary,
        reason: schema.promotions.reason,
        notes: schema.promotions.notes,
        createdAt: schema.promotions.createdAt,
        updatedAt: schema.promotions.updatedAt,
        createdBy: schema.promotions.createdBy,
        updatedBy: schema.promotions.updatedBy,
      })
      .from(schema.promotions)
      .innerJoin(
        schema.employees,
        eq(schema.promotions.employeeId, schema.employees.id)
      )
      .innerJoin(
        previousJobPositionTable,
        eq(schema.promotions.previousJobPositionId, previousJobPositionTable.id)
      )
      .innerJoin(
        newJobPositionTable,
        eq(schema.promotions.newJobPositionId, newJobPositionTable.id)
      )
      .where(
        and(
          eq(schema.promotions.organizationId, organizationId),
          isNull(schema.promotions.deletedAt)
        )
      )
      .orderBy(schema.promotions.promotionDate);

    return promotions as PromotionData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<PromotionData> {
    const promotion = await PromotionService.findById(id, organizationId);
    if (!promotion) {
      throw new PromotionNotFoundError(id);
    }
    return promotion;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdatePromotionInput
  ): Promise<PromotionData> {
    const { userId, ...data } = input;

    const existing = await PromotionService.findById(id, organizationId);
    if (!existing) {
      throw new PromotionNotFoundError(id);
    }

    if (data.employeeId) {
      await EmployeeService.findByIdOrThrow(data.employeeId, organizationId);
    }

    if (data.previousJobPositionId) {
      await JobPositionService.findByIdOrThrow(
        data.previousJobPositionId,
        organizationId
      );
    }

    if (data.newJobPositionId) {
      await JobPositionService.findByIdOrThrow(
        data.newJobPositionId,
        organizationId
      );
    }

    const finalPreviousJobPositionId =
      data.previousJobPositionId ?? existing.previousJobPosition.id;
    const finalNewJobPositionId =
      data.newJobPositionId ?? existing.newJobPosition.id;

    if (finalPreviousJobPositionId === finalNewJobPositionId) {
      throw new InvalidPromotionDataError(
        "O cargo anterior e o novo cargo não podem ser iguais",
        {
          previousJobPositionId: finalPreviousJobPositionId,
          newJobPositionId: finalNewJobPositionId,
        }
      );
    }

    if (data.previousSalary !== undefined || data.newSalary !== undefined) {
      const effectivePreviousSalary =
        data.previousSalary ?? Number.parseFloat(existing.previousSalary);
      const effectiveNewSalary =
        data.newSalary ?? Number.parseFloat(existing.newSalary);
      PromotionService.validateSalaryIncrease(
        effectivePreviousSalary,
        effectiveNewSalary
      );
    }

    if (data.promotionDate !== undefined) {
      await PromotionService.ensureNoDuplicateDate({
        organizationId,
        employeeId: existing.employee.id,
        promotionDate: data.promotionDate,
        excludeId: id,
      });
    }

    // Only the latest promotion can be updated
    await PromotionService.ensureIsLatestPromotion(
      id,
      existing.employee.id,
      organizationId
    );

    await db
      .update(schema.promotions)
      .set(PromotionService.buildUpdateData(data, userId))
      .where(
        and(
          eq(schema.promotions.id, id),
          eq(schema.promotions.organizationId, organizationId)
        )
      );

    // Re-sync employee with the updated promotion values
    const updatedPromotion = await PromotionService.findById(
      id,
      organizationId
    );
    if (!updatedPromotion) {
      throw new PromotionNotFoundError(id);
    }

    await PromotionService.syncEmployeeFromPromotion({
      employeeId: existing.employee.id,
      organizationId,
      salary: updatedPromotion.newSalary,
      jobPositionId: updatedPromotion.newJobPosition.id,
      userId,
    });

    return updatedPromotion;
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedPromotionData> {
    const existing = await PromotionService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new PromotionNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new PromotionAlreadyDeletedError(id);
    }

    // Get raw data for guard check and potential revert
    const [rawPromotion] = await db
      .select({
        employeeId: schema.promotions.employeeId,
        previousSalary: schema.promotions.previousSalary,
        previousJobPositionId: schema.promotions.previousJobPositionId,
      })
      .from(schema.promotions)
      .where(eq(schema.promotions.id, id))
      .limit(1);

    await PromotionService.ensureIsLatestPromotion(
      id,
      rawPromotion.employeeId,
      organizationId
    );

    const [deleted] = await db
      .update(schema.promotions)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.promotions.id, id),
          eq(schema.promotions.organizationId, organizationId)
        )
      )
      .returning();

    // Revert employee to previous promotion or pre-promotion values
    const previousPromotion = await PromotionService.findLatestPromotionRaw(
      rawPromotion.employeeId,
      organizationId
    );

    if (previousPromotion) {
      // Revert to previous promotion's new values
      await PromotionService.syncEmployeeFromPromotion({
        employeeId: rawPromotion.employeeId,
        organizationId,
        salary: previousPromotion.newSalary,
        jobPositionId: previousPromotion.newJobPositionId,
        userId,
      });
    } else {
      // No previous promotion — revert to pre-promotion values
      await PromotionService.syncEmployeeFromPromotion({
        employeeId: rawPromotion.employeeId,
        organizationId,
        salary: rawPromotion.previousSalary,
        jobPositionId: rawPromotion.previousJobPositionId,
        userId,
      });
    }

    return {
      id: deleted.id,
      organizationId: deleted.organizationId,
      employee: existing.employee,
      promotionDate: deleted.promotionDate,
      previousJobPosition: existing.previousJobPosition,
      newJobPosition: existing.newJobPosition,
      previousSalary: deleted.previousSalary,
      newSalary: deleted.newSalary,
      reason: deleted.reason,
      notes: deleted.notes,
      createdAt: deleted.createdAt,
      updatedAt: deleted.updatedAt,
      createdBy: deleted.createdBy,
      updatedBy: deleted.updatedBy,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    };
  }
}
