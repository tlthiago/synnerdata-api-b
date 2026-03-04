import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { schema } from "@/db/schema";
import {
  MedicalCertificateAlreadyDeletedError,
  MedicalCertificateInvalidEmployeeError,
  MedicalCertificateNotFoundError,
} from "./errors";
import type {
  CreateMedicalCertificateInput,
  DeletedMedicalCertificateData,
  MedicalCertificateData,
  UpdateMedicalCertificateInput,
} from "./medical-certificates.model";

export abstract class MedicalCertificateService {
  private static async findById(
    id: string,
    organizationId: string
  ): Promise<MedicalCertificateData | null> {
    const [result] = await db
      .select({
        id: schema.medicalCertificates.id,
        organizationId: schema.medicalCertificates.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.medicalCertificates.startDate,
        endDate: schema.medicalCertificates.endDate,
        daysOff: schema.medicalCertificates.daysOff,
        cid: schema.medicalCertificates.cid,
        doctorName: schema.medicalCertificates.doctorName,
        doctorCrm: schema.medicalCertificates.doctorCrm,
        notes: schema.medicalCertificates.notes,
        createdAt: schema.medicalCertificates.createdAt,
        updatedAt: schema.medicalCertificates.updatedAt,
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.id, id),
          eq(schema.medicalCertificates.organizationId, organizationId),
          isNull(schema.medicalCertificates.deletedAt)
        )
      )
      .limit(1);

    return (result as MedicalCertificateData) ?? null;
  }

  private static async findByIdIncludingDeleted(
    id: string,
    organizationId: string
  ): Promise<
    | (MedicalCertificateData & {
        deletedAt: Date | null;
        deletedBy: string | null;
      })
    | null
  > {
    const [result] = await db
      .select({
        id: schema.medicalCertificates.id,
        organizationId: schema.medicalCertificates.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.medicalCertificates.startDate,
        endDate: schema.medicalCertificates.endDate,
        daysOff: schema.medicalCertificates.daysOff,
        cid: schema.medicalCertificates.cid,
        doctorName: schema.medicalCertificates.doctorName,
        doctorCrm: schema.medicalCertificates.doctorCrm,
        notes: schema.medicalCertificates.notes,
        createdAt: schema.medicalCertificates.createdAt,
        updatedAt: schema.medicalCertificates.updatedAt,
        deletedAt: schema.medicalCertificates.deletedAt,
        deletedBy: schema.medicalCertificates.deletedBy,
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.id, id),
          eq(schema.medicalCertificates.organizationId, organizationId)
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
      throw new MedicalCertificateInvalidEmployeeError(employeeId);
    }

    return employee;
  }

  static async create(
    input: CreateMedicalCertificateInput
  ): Promise<MedicalCertificateData> {
    const { organizationId, userId, employeeId, ...data } = input;

    const employee = await MedicalCertificateService.getEmployeeReference(
      employeeId,
      organizationId
    );

    const medicalCertificateId = `medical-certificate-${crypto.randomUUID()}`;

    const [medicalCertificate] = await db
      .insert(schema.medicalCertificates)
      .values({
        id: medicalCertificateId,
        organizationId,
        employeeId,
        startDate: data.startDate,
        endDate: data.endDate,
        daysOff: data.daysOff,
        cid: data.cid,
        doctorName: data.doctorName,
        doctorCrm: data.doctorCrm,
        notes: data.notes,
        createdBy: userId,
      })
      .returning();

    return {
      id: medicalCertificate.id,
      organizationId: medicalCertificate.organizationId,
      employee,
      startDate: medicalCertificate.startDate,
      endDate: medicalCertificate.endDate,
      daysOff: medicalCertificate.daysOff,
      cid: medicalCertificate.cid,
      doctorName: medicalCertificate.doctorName,
      doctorCrm: medicalCertificate.doctorCrm,
      notes: medicalCertificate.notes,
      createdAt: medicalCertificate.createdAt,
      updatedAt: medicalCertificate.updatedAt,
    } as MedicalCertificateData;
  }

  static async findAll(
    organizationId: string
  ): Promise<MedicalCertificateData[]> {
    const results = await db
      .select({
        id: schema.medicalCertificates.id,
        organizationId: schema.medicalCertificates.organizationId,
        employee: {
          id: schema.employees.id,
          name: schema.employees.name,
        },
        startDate: schema.medicalCertificates.startDate,
        endDate: schema.medicalCertificates.endDate,
        daysOff: schema.medicalCertificates.daysOff,
        cid: schema.medicalCertificates.cid,
        doctorName: schema.medicalCertificates.doctorName,
        doctorCrm: schema.medicalCertificates.doctorCrm,
        notes: schema.medicalCertificates.notes,
        createdAt: schema.medicalCertificates.createdAt,
        updatedAt: schema.medicalCertificates.updatedAt,
      })
      .from(schema.medicalCertificates)
      .innerJoin(
        schema.employees,
        eq(schema.medicalCertificates.employeeId, schema.employees.id)
      )
      .where(
        and(
          eq(schema.medicalCertificates.organizationId, organizationId),
          isNull(schema.medicalCertificates.deletedAt)
        )
      )
      .orderBy(schema.medicalCertificates.startDate);

    return results as MedicalCertificateData[];
  }

  static async findByIdOrThrow(
    id: string,
    organizationId: string
  ): Promise<MedicalCertificateData> {
    const medicalCertificate = await MedicalCertificateService.findById(
      id,
      organizationId
    );
    if (!medicalCertificate) {
      throw new MedicalCertificateNotFoundError(id);
    }
    return medicalCertificate;
  }

  static async update(
    id: string,
    organizationId: string,
    input: UpdateMedicalCertificateInput
  ): Promise<MedicalCertificateData> {
    const { userId, employeeId, ...data } = input;

    const existing = await MedicalCertificateService.findById(
      id,
      organizationId
    );
    if (!existing) {
      throw new MedicalCertificateNotFoundError(id);
    }

    const updateData: Record<string, unknown> = {
      updatedBy: userId,
    };

    if (employeeId !== undefined) {
      await MedicalCertificateService.getEmployeeReference(
        employeeId,
        organizationId
      );
      updateData.employeeId = employeeId;
    }
    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate;
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate;
    }
    if (data.daysOff !== undefined) {
      updateData.daysOff = data.daysOff;
    }
    if (data.cid !== undefined) {
      updateData.cid = data.cid;
    }
    if (data.doctorName !== undefined) {
      updateData.doctorName = data.doctorName;
    }
    if (data.doctorCrm !== undefined) {
      updateData.doctorCrm = data.doctorCrm;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    await db
      .update(schema.medicalCertificates)
      .set(updateData)
      .where(
        and(
          eq(schema.medicalCertificates.id, id),
          eq(schema.medicalCertificates.organizationId, organizationId)
        )
      );

    return MedicalCertificateService.findByIdOrThrow(id, organizationId);
  }

  static async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<DeletedMedicalCertificateData> {
    const existing = await MedicalCertificateService.findByIdIncludingDeleted(
      id,
      organizationId
    );

    if (!existing) {
      throw new MedicalCertificateNotFoundError(id);
    }

    if (existing.deletedAt) {
      throw new MedicalCertificateAlreadyDeletedError(id);
    }

    const [deleted] = await db
      .update(schema.medicalCertificates)
      .set({
        deletedAt: new Date(),
        deletedBy: userId,
      })
      .where(
        and(
          eq(schema.medicalCertificates.id, id),
          eq(schema.medicalCertificates.organizationId, organizationId)
        )
      )
      .returning();

    return {
      ...existing,
      deletedAt: deleted.deletedAt as Date,
      deletedBy: deleted.deletedBy,
    } as DeletedMedicalCertificateData;
  }
}
