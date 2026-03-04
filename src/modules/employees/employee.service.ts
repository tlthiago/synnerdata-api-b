import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import type { EntityReference } from "@/lib/schemas/relationships";
import type {
  CreateEmployeeInput,
  DeletedEmployeeData,
  EmployeeData,
  UpdateEmployeeInput,
  UpdateEmployeeStatusInput,
} from "./employee.model";
import {
  EmployeeAlreadyDeletedError,
  EmployeeCpfAlreadyExistsError,
  EmployeeInvalidBranchError,
  EmployeeInvalidCostCenterError,
  EmployeeInvalidJobClassificationError,
  EmployeeInvalidJobPositionError,
  EmployeeInvalidSectorError,
  EmployeeNotFoundError,
} from "./errors";

type EmployeeRaw = typeof schema.employees.$inferSelect;

export abstract class EmployeeService {
  private static async getSectorReference(
    sectorId: string,
    organizationId: string
  ): Promise<EntityReference> {
    const [sector] = await db
      .select({ id: schema.sectors.id, name: schema.sectors.name })
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.id, sectorId),
          eq(schema.sectors.organizationId, organizationId)
        )
      )
      .limit(1);
    return sector;
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

  private static async getJobClassificationReference(
    jobClassificationId: string,
    organizationId: string
  ): Promise<EntityReference> {
    const [jobClassification] = await db
      .select({
        id: schema.jobClassifications.id,
        name: schema.jobClassifications.name,
      })
      .from(schema.jobClassifications)
      .where(
        and(
          eq(schema.jobClassifications.id, jobClassificationId),
          eq(schema.jobClassifications.organizationId, organizationId)
        )
      )
      .limit(1);
    return jobClassification;
  }

  private static async getBranchReference(
    branchId: string,
    organizationId: string
  ): Promise<EntityReference | null> {
    const [branch] = await db
      .select({ id: schema.branches.id, name: schema.branches.name })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.id, branchId),
          eq(schema.branches.organizationId, organizationId)
        )
      )
      .limit(1);
    return branch ?? null;
  }

  private static async getCostCenterReference(
    costCenterId: string,
    organizationId: string
  ): Promise<EntityReference | null> {
    const [costCenter] = await db
      .select({ id: schema.costCenters.id, name: schema.costCenters.name })
      .from(schema.costCenters)
      .where(
        and(
          eq(schema.costCenters.id, costCenterId),
          eq(schema.costCenters.organizationId, organizationId)
        )
      )
      .limit(1);
    return costCenter ?? null;
  }

  private static async enrichEmployee(
    employee: EmployeeRaw,
    organizationId: string
  ): Promise<EmployeeData> {
    const [sector, jobPosition, jobClassification, branch, costCenter] =
      await Promise.all([
        EmployeeService.getSectorReference(employee.sectorId, organizationId),
        EmployeeService.getJobPositionReference(
          employee.jobPositionId,
          organizationId
        ),
        EmployeeService.getJobClassificationReference(
          employee.jobClassificationId,
          organizationId
        ),
        employee.branchId
          ? EmployeeService.getBranchReference(
              employee.branchId,
              organizationId
            )
          : Promise.resolve(null),
        employee.costCenterId
          ? EmployeeService.getCostCenterReference(
              employee.costCenterId,
              organizationId
            )
          : Promise.resolve(null),
      ]);

    return {
      id: employee.id,
      organizationId: employee.organizationId,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      mobile: employee.mobile,
      birthDate: employee.birthDate,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      birthplace: employee.birthplace,
      nationality: employee.nationality,
      height: employee.height,
      weight: employee.weight,
      fatherName: employee.fatherName,
      motherName: employee.motherName,
      cpf: employee.cpf,
      identityCard: employee.identityCard,
      pis: employee.pis,
      workPermitNumber: employee.workPermitNumber,
      workPermitSeries: employee.workPermitSeries,
      militaryCertificate: employee.militaryCertificate,
      street: employee.street,
      streetNumber: employee.streetNumber,
      complement: employee.complement,
      neighborhood: employee.neighborhood,
      city: employee.city,
      state: employee.state,
      zipCode: employee.zipCode,
      latitude: employee.latitude,
      longitude: employee.longitude,
      hireDate: employee.hireDate,
      contractType: employee.contractType,
      salary: employee.salary,
      status: employee.status,
      manager: employee.manager,
      branch,
      sector,
      costCenter,
      jobPosition,
      jobClassification,
      workShift: employee.workShift,
      weeklyHours: employee.weeklyHours,
      busCount: employee.busCount,
      mealAllowance: employee.mealAllowance,
      transportAllowance: employee.transportAllowance,
      educationLevel: employee.educationLevel,
      hasSpecialNeeds: employee.hasSpecialNeeds,
      disabilityType: employee.disabilityType,
      hasChildren: employee.hasChildren,
      childrenCount: employee.childrenCount,
      hasChildrenUnder21: employee.hasChildrenUnder21,
      lastHealthExamDate: employee.lastHealthExamDate,
      admissionExamDate: employee.admissionExamDate,
      terminationExamDate: employee.terminationExamDate,
      probation1ExpiryDate: employee.probation1ExpiryDate,
      probation2ExpiryDate: employee.probation2ExpiryDate,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  private static async findById(
    id: string,
    organizationId: string
  ): Promise<EmployeeData | null> {
    const [employee] = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    if (!employee) {
      return null;
    }

    return EmployeeService.enrichEmployee(employee, organizationId);
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<(EmployeeData & { deletedAt: Date | null }) | null> {
    const [employee] = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!employee) {
      return null;
    }

    const enriched = await EmployeeService.enrichEmployee(
      employee,
      organizationId
    );
    return { ...enriched, deletedAt: employee.deletedAt };
  }

  private static async ensureCpfNotExists(
    cpf: string,
    organizationId: string,
    excludeId?: string
  ): Promise<void> {
    const [existing] = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.cpf, cpf),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    if (existing && existing.id !== excludeId) {
      throw new EmployeeCpfAlreadyExistsError(cpf);
    }
  }

  private static async validateBranch(
    branchId: string,
    organizationId: string
  ): Promise<void> {
    const [branch] = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(
        and(
          eq(schema.branches.id, branchId),
          eq(schema.branches.organizationId, organizationId),
          isNull(schema.branches.deletedAt)
        )
      )
      .limit(1);

    if (!branch) {
      throw new EmployeeInvalidBranchError(branchId);
    }
  }

  private static async validateSector(
    sectorId: string,
    organizationId: string
  ): Promise<void> {
    const [sector] = await db
      .select({ id: schema.sectors.id })
      .from(schema.sectors)
      .where(
        and(
          eq(schema.sectors.id, sectorId),
          eq(schema.sectors.organizationId, organizationId),
          isNull(schema.sectors.deletedAt)
        )
      )
      .limit(1);

    if (!sector) {
      throw new EmployeeInvalidSectorError(sectorId);
    }
  }

  private static async validateCostCenter(
    costCenterId: string,
    organizationId: string
  ): Promise<void> {
    const [costCenter] = await db
      .select({ id: schema.costCenters.id })
      .from(schema.costCenters)
      .where(
        and(
          eq(schema.costCenters.id, costCenterId),
          eq(schema.costCenters.organizationId, organizationId),
          isNull(schema.costCenters.deletedAt)
        )
      )
      .limit(1);

    if (!costCenter) {
      throw new EmployeeInvalidCostCenterError(costCenterId);
    }
  }

  private static async validateJobPosition(
    jobPositionId: string,
    organizationId: string
  ): Promise<void> {
    const [jobPosition] = await db
      .select({ id: schema.jobPositions.id })
      .from(schema.jobPositions)
      .where(
        and(
          eq(schema.jobPositions.id, jobPositionId),
          eq(schema.jobPositions.organizationId, organizationId),
          isNull(schema.jobPositions.deletedAt)
        )
      )
      .limit(1);

    if (!jobPosition) {
      throw new EmployeeInvalidJobPositionError(jobPositionId);
    }
  }

  private static async validateJobClassification(
    jobClassificationId: string,
    organizationId: string
  ): Promise<void> {
    const [jobClassification] = await db
      .select({ id: schema.jobClassifications.id })
      .from(schema.jobClassifications)
      .where(
        and(
          eq(schema.jobClassifications.id, jobClassificationId),
          eq(schema.jobClassifications.organizationId, organizationId),
          isNull(schema.jobClassifications.deletedAt)
        )
      )
      .limit(1);

    if (!jobClassification) {
      throw new EmployeeInvalidJobClassificationError(jobClassificationId);
    }
  }

  private static async validateRelationships(
    data: {
      branchId?: string;
      sectorId: string;
      costCenterId?: string;
      jobPositionId: string;
      jobClassificationId: string;
    },
    organizationId: string
  ): Promise<void> {
    const validations: Promise<void>[] = [
      EmployeeService.validateSector(data.sectorId, organizationId),
      EmployeeService.validateJobPosition(data.jobPositionId, organizationId),
      EmployeeService.validateJobClassification(
        data.jobClassificationId,
        organizationId
      ),
    ];

    if (data.branchId) {
      validations.push(
        EmployeeService.validateBranch(data.branchId, organizationId)
      );
    }

    if (data.costCenterId) {
      validations.push(
        EmployeeService.validateCostCenter(data.costCenterId, organizationId)
      );
    }

    await Promise.all(validations);
  }

  static async create(input: CreateEmployeeInput): Promise<EmployeeData> {
    const { organizationId, userId, ...data } = input;

    const { LimitsService } = await import(
      "@/modules/payments/limits/limits.service"
    );
    await LimitsService.requireEmployeeLimit(organizationId);

    await EmployeeService.ensureCpfNotExists(data.cpf, organizationId);

    await EmployeeService.validateRelationships(
      {
        branchId: data.branchId,
        sectorId: data.sectorId,
        costCenterId: data.costCenterId,
        jobPositionId: data.jobPositionId,
        jobClassificationId: data.jobClassificationId,
      },
      organizationId
    );

    const employeeId = `employee-${crypto.randomUUID()}`;

    const [employee] = await db
      .insert(schema.employees)
      .values({
        id: employeeId,
        organizationId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        mobile: data.mobile,
        birthDate: data.birthDate,
        gender: data.gender,
        maritalStatus: data.maritalStatus,
        birthplace: data.birthplace,
        nationality: data.nationality,
        height: data.height?.toString(),
        weight: data.weight?.toString(),
        fatherName: data.fatherName,
        motherName: data.motherName,
        cpf: data.cpf,
        identityCard: data.identityCard,
        pis: data.pis,
        workPermitNumber: data.workPermitNumber,
        workPermitSeries: data.workPermitSeries,
        militaryCertificate: data.militaryCertificate,
        street: data.street,
        streetNumber: data.streetNumber,
        complement: data.complement,
        neighborhood: data.neighborhood,
        city: data.city,
        state: data.state,
        zipCode: data.zipCode,
        latitude: data.latitude?.toString(),
        longitude: data.longitude?.toString(),
        hireDate: data.hireDate,
        contractType: data.contractType,
        salary: data.salary.toString(),
        manager: data.manager,
        branchId: data.branchId,
        sectorId: data.sectorId,
        costCenterId: data.costCenterId,
        jobPositionId: data.jobPositionId,
        jobClassificationId: data.jobClassificationId,
        workShift: data.workShift,
        weeklyHours: data.weeklyHours.toString(),
        busCount: data.busCount,
        mealAllowance: data.mealAllowance?.toString(),
        transportAllowance: data.transportAllowance?.toString(),
        educationLevel: data.educationLevel,
        hasSpecialNeeds: data.hasSpecialNeeds,
        disabilityType: data.disabilityType,
        hasChildren: data.hasChildren,
        childrenCount: data.childrenCount,
        hasChildrenUnder21: data.hasChildrenUnder21,
        lastHealthExamDate: data.lastHealthExamDate,
        admissionExamDate: data.admissionExamDate,
        terminationExamDate: data.terminationExamDate,
        probation1ExpiryDate: data.probation1ExpiryDate,
        probation2ExpiryDate: data.probation2ExpiryDate,
        createdBy: userId,
      })
      .returning();

    return EmployeeService.enrichEmployee(employee, organizationId);
  }

  static async findAll(organizationId: string): Promise<EmployeeData[]> {
    const employees = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .orderBy(schema.employees.name);

    const enriched = await Promise.all(
      employees.map((e) => EmployeeService.enrichEmployee(e, organizationId))
    );

    return enriched;
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<EmployeeData> {
    const employee = await EmployeeService.findById(id, organizationId);
    if (!employee) {
      throw new EmployeeNotFoundError(id);
    }
    return employee;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateEmployeeInput
  ): Promise<EmployeeData> {
    const { userId, ...data } = input;

    const [existingRaw] = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.organizationId, organizationId),
          isNull(schema.employees.deletedAt)
        )
      )
      .limit(1);

    if (!existingRaw) {
      throw new EmployeeNotFoundError(id);
    }

    if (data.cpf && data.cpf !== existingRaw.cpf) {
      await EmployeeService.ensureCpfNotExists(data.cpf, organizationId, id);
    }

    // Validate relationships if any FK is being updated
    const relationshipsToValidate = {
      branchId: data.branchId ?? existingRaw.branchId ?? undefined,
      sectorId: data.sectorId ?? existingRaw.sectorId,
      costCenterId: data.costCenterId ?? existingRaw.costCenterId ?? undefined,
      jobPositionId: data.jobPositionId ?? existingRaw.jobPositionId,
      jobClassificationId:
        data.jobClassificationId ?? existingRaw.jobClassificationId,
    };

    if (
      data.branchId ||
      data.sectorId ||
      data.costCenterId ||
      data.jobPositionId ||
      data.jobClassificationId
    ) {
      await EmployeeService.validateRelationships(
        relationshipsToValidate,
        organizationId
      );
    }

    // Build update data, converting numeric fields to strings for decimal columns
    const numericToString = (val: number | undefined | null) =>
      val !== undefined && val !== null ? val.toString() : undefined;

    const fieldMappings: Record<string, unknown> = {
      name: data.name,
      email: data.email,
      phone: data.phone,
      mobile: data.mobile,
      birthDate: data.birthDate,
      gender: data.gender,
      maritalStatus: data.maritalStatus,
      birthplace: data.birthplace,
      nationality: data.nationality,
      height: numericToString(data.height),
      weight: numericToString(data.weight),
      fatherName: data.fatherName,
      motherName: data.motherName,
      cpf: data.cpf,
      identityCard: data.identityCard,
      pis: data.pis,
      workPermitNumber: data.workPermitNumber,
      workPermitSeries: data.workPermitSeries,
      militaryCertificate: data.militaryCertificate,
      street: data.street,
      streetNumber: data.streetNumber,
      complement: data.complement,
      neighborhood: data.neighborhood,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      latitude: numericToString(data.latitude),
      longitude: numericToString(data.longitude),
      hireDate: data.hireDate,
      contractType: data.contractType,
      salary: numericToString(data.salary),
      manager: data.manager,
      branchId: data.branchId,
      sectorId: data.sectorId,
      costCenterId: data.costCenterId,
      jobPositionId: data.jobPositionId,
      jobClassificationId: data.jobClassificationId,
      workShift: data.workShift,
      weeklyHours: numericToString(data.weeklyHours),
      busCount: data.busCount,
      mealAllowance: numericToString(data.mealAllowance),
      transportAllowance: numericToString(data.transportAllowance),
      educationLevel: data.educationLevel,
      hasSpecialNeeds: data.hasSpecialNeeds,
      disabilityType: data.disabilityType,
      hasChildren: data.hasChildren,
      childrenCount: data.childrenCount,
      hasChildrenUnder21: data.hasChildrenUnder21,
      lastHealthExamDate: data.lastHealthExamDate,
      admissionExamDate: data.admissionExamDate,
      terminationExamDate: data.terminationExamDate,
      probation1ExpiryDate: data.probation1ExpiryDate,
      probation2ExpiryDate: data.probation2ExpiryDate,
    };

    // Filter out undefined values and add audit field
    const updateData = Object.fromEntries(
      Object.entries(fieldMappings).filter(([, v]) => v !== undefined)
    );
    updateData.updatedBy = userId;

    const [updated] = await db
      .update(schema.employees)
      .set(updateData)
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.organizationId, organizationId)
        )
      )
      .returning();

    return EmployeeService.enrichEmployee(updated, organizationId);
  }

  static async updateStatus(
    id: string,
    organizationId: string,
    input: UpdateEmployeeStatusInput
  ): Promise<EmployeeData> {
    const { userId, status } = input;

    const existing = await EmployeeService.findById(id, organizationId);
    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }

    const [updated] = await db
      .update(schema.employees)
      .set({
        status,
        updatedBy: userId,
      })
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.organizationId, organizationId)
        )
      )
      .returning();

    return EmployeeService.enrichEmployee(updated, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedEmployeeData> {
    const existing = await EmployeeService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new EmployeeNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new EmployeeAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.employees)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.employees.id, id),
          eq(schema.employees.organizationId, organizationId)
        )
      )
      .returning();

    const enriched = await EmployeeService.enrichEmployee(
      deleted,
      organizationId
    );

    return {
      ...enriched,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    };
  }
}
