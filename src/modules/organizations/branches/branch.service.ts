import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import { auditUserAliases } from "@/lib/schemas/audit-users";
import { AuditService } from "@/modules/audit/audit.service";
import { buildAuditChanges, PII_FIELDS } from "@/modules/audit/pii-redaction";
import type {
  BranchData,
  CreateBranchInput,
  DeletedBranchData,
  UpdateBranchInput,
} from "./branch.model";
import {
  BranchAlreadyDeletedError,
  BranchNotFoundError,
  BranchTaxIdAlreadyExistsError,
} from "./errors";

const BRANCH_PII_FIELDS = new Set([...PII_FIELDS, "taxId"]);

export abstract class BranchService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<BranchData | null> {
    const { creator, updater } = auditUserAliases();

    const [branch] = await db
      .select({
        id: schema.branches.id,
        organizationId: schema.branches.organizationId,
        name: schema.branches.name,
        taxId: schema.branches.taxId,
        street: schema.branches.street,
        number: schema.branches.number,
        complement: schema.branches.complement,
        neighborhood: schema.branches.neighborhood,
        city: schema.branches.city,
        state: schema.branches.state,
        zipCode: schema.branches.zipCode,
        phone: schema.branches.phone,
        mobile: schema.branches.mobile,
        foundedAt: schema.branches.foundedAt,
        createdAt: schema.branches.createdAt,
        updatedAt: schema.branches.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.branches)
      .innerJoin(creator, eq(schema.branches.createdBy, creator.id))
      .innerJoin(updater, eq(schema.branches.updatedBy, updater.id))
      .where(
        and(
          eq(schema.branches.id, id),
          eq(schema.branches.organizationId, organizationId),
          isNull(schema.branches.deletedAt)
        )
      )
      .limit(1);

    return branch ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(BranchData & { deletedAt: Date | null }) | null> {
    const { creator, updater } = auditUserAliases();

    const [branch] = await db
      .select({
        id: schema.branches.id,
        organizationId: schema.branches.organizationId,
        name: schema.branches.name,
        taxId: schema.branches.taxId,
        street: schema.branches.street,
        number: schema.branches.number,
        complement: schema.branches.complement,
        neighborhood: schema.branches.neighborhood,
        city: schema.branches.city,
        state: schema.branches.state,
        zipCode: schema.branches.zipCode,
        phone: schema.branches.phone,
        mobile: schema.branches.mobile,
        foundedAt: schema.branches.foundedAt,
        createdAt: schema.branches.createdAt,
        updatedAt: schema.branches.updatedAt,
        deletedAt: schema.branches.deletedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.branches)
      .innerJoin(creator, eq(schema.branches.createdBy, creator.id))
      .innerJoin(updater, eq(schema.branches.updatedBy, updater.id))
      .where(
        and(
          eq(schema.branches.id, id),
          eq(schema.branches.organizationId, organizationId)
        )
      )
      .limit(1);

    return branch ?? null;
  }

  static async ensureTaxIdNotExists(
    taxId: string,
    excludeId?: string
  ): Promise<void> {
    const [existingBranch] = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(eq(schema.branches.taxId, taxId), isNull(schema.branches.deletedAt))
      )
      .limit(1);

    if (existingBranch && existingBranch.id !== excludeId) {
      throw new BranchTaxIdAlreadyExistsError(taxId);
    }

    const [existingProfile] = await db
      .select({ id: schema.organizationProfiles.id })
      .from(schema.organizationProfiles)
      .where(eq(schema.organizationProfiles.taxId, taxId))
      .limit(1);

    if (existingProfile) {
      throw new BranchTaxIdAlreadyExistsError(taxId);
    }
  }

  static async create(input: CreateBranchInput): Promise<BranchData> {
    const { organizationId, userId, ...data } = input;

    await BranchService.ensureTaxIdNotExists(data.taxId);

    const branchId = `branch-${crypto.randomUUID()}`;

    const [branch] = await db
      .insert(schema.branches)
      .values({
        id: branchId,
        organizationId,
        name: data.name,
        taxId: data.taxId,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        phone: data.phone,
        mobile: data.mobile,
        foundedAt: data.foundedAt,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await AuditService.log({
      action: "create",
      resource: "branch",
      resourceId: branch.id,
      userId,
      organizationId,
      changes: buildAuditChanges({}, branch, { piiFields: BRANCH_PII_FIELDS }),
    });

    return BranchService.findByIdOrThrow(branch.id, organizationId);
  }

  static async findAll(organizationId: string): Promise<BranchData[]> {
    const { creator, updater } = auditUserAliases();

    const branches = await db
      .select({
        id: schema.branches.id,
        organizationId: schema.branches.organizationId,
        name: schema.branches.name,
        taxId: schema.branches.taxId,
        street: schema.branches.street,
        number: schema.branches.number,
        complement: schema.branches.complement,
        neighborhood: schema.branches.neighborhood,
        city: schema.branches.city,
        state: schema.branches.state,
        zipCode: schema.branches.zipCode,
        phone: schema.branches.phone,
        mobile: schema.branches.mobile,
        foundedAt: schema.branches.foundedAt,
        createdAt: schema.branches.createdAt,
        updatedAt: schema.branches.updatedAt,
        createdBy: {
          id: creator.id,
          name: creator.name,
        },
        updatedBy: {
          id: updater.id,
          name: updater.name,
        },
      })
      .from(schema.branches)
      .innerJoin(creator, eq(schema.branches.createdBy, creator.id))
      .innerJoin(updater, eq(schema.branches.updatedBy, updater.id))
      .where(
        and(
          eq(schema.branches.organizationId, organizationId),
          isNull(schema.branches.deletedAt)
        )
      )
      .orderBy(schema.branches.name);

    return branches;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<BranchData> {
    const branch = await BranchService.findById(id, organizationId);
    if (!branch) {
      throw new BranchNotFoundError(id);
    }
    return branch;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateBranchInput
  ): Promise<BranchData> {
    const { userId, ...data } = input;

    const existing = await BranchService.findById(id, organizationId);
    if (!existing) {
      throw new BranchNotFoundError(id);
    }

    if (data.taxId && data.taxId !== existing.taxId) {
      await BranchService.ensureTaxIdNotExists(data.taxId, id);
    }

    const [updated] = await db
      .update(schema.branches)
      .set({
        ...data,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.branches.id, id),
          eq(schema.branches.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "update",
      resource: "branch",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(existing, updated, {
        piiFields: BRANCH_PII_FIELDS,
      }),
    });

    return BranchService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedBranchData> {
    const existing = await BranchService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new BranchNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new BranchAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.branches)
      .set({
        deletedAt: new Date(),
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.branches.id, id),
          eq(schema.branches.organizationId, organizationId)
        )
      )
      .returning();

    await AuditService.log({
      action: "delete",
      resource: "branch",
      resourceId: id,
      userId,
      organizationId,
      changes: buildAuditChanges(
        existing,
        {},
        { piiFields: BRANCH_PII_FIELDS }
      ),
    });

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
    };
  }
}
