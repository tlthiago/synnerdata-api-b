import { aliasedTable, and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { EntityReference } from "@/lib/schemas/relationships";
import { EmployeeService } from "@/modules/employees/employee.service";
import { JobPositionService } from "@/modules/organization/job-positions/job-position.service";
import {
  InvalidPromotionDataError,
  PromotionAlreadyDeletedError,
  PromotionNotFoundError,
} from "./errors";
import type {
  CreatePromotionInput,
  DeletedPromotionData,
  PromotionData,
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
          eq(schema.employees.organizationId, organizationId)
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
          eq(schema.jobPositions.organizationId, organizationId)
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

  static async create(input: CreatePromotionInput): Promise<PromotionData> {
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

    const parsedPreviousSalary = Number.parseFloat(previousSalary);
    const parsedNewSalary = Number.parseFloat(newSalary);

    if (parsedNewSalary <= parsedPreviousSalary) {
      throw new InvalidPromotionDataError(
        "O novo salário deve ser maior que o salário anterior",
        { previousSalary, newSalary }
      );
    }

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
        previousSalary,
        newSalary,
        reason: reason ?? null,
        notes: notes ?? null,
        createdBy: userId,
      })
      .returning();

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

    if (data.previousSalary || data.newSalary) {
      const parsedPreviousSalary = data.previousSalary
        ? Number.parseFloat(data.previousSalary)
        : Number.parseFloat(existing.previousSalary);
      const parsedNewSalary = data.newSalary
        ? Number.parseFloat(data.newSalary)
        : Number.parseFloat(existing.newSalary);

      if (parsedNewSalary <= parsedPreviousSalary) {
        throw new InvalidPromotionDataError(
          "O novo salário deve ser maior que o salário anterior",
          {
            previousSalary: parsedPreviousSalary.toString(),
            newSalary: parsedNewSalary.toString(),
          }
        );
      }
    }

    await db
      .update(schema.promotions)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.promotions.id, id),
          eq(schema.promotions.organizationId, organizationId)
        )
      );

    const updated = await PromotionService.findById(id, organizationId);
    return updated as PromotionData;
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
