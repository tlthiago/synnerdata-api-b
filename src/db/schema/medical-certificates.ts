import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./auth";
import { employees } from "./employees";

export const medicalCertificates = pgTable(
  "medical_certificates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),

    // Certificate data
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    daysOff: integer("days_off").notNull(),
    cid: text("cid"),
    doctorName: text("doctor_name"),
    doctorCrm: text("doctor_crm"),
    notes: text("notes"),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("medical_certificates_organization_id_idx").on(table.organizationId),
    index("medical_certificates_employee_id_idx").on(table.employeeId),
  ]
);

export const medicalCertificateRelations = relations(
  medicalCertificates,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [medicalCertificates.organizationId],
      references: [organizations.id],
    }),
    employee: one(employees, {
      fields: [medicalCertificates.employeeId],
      references: [employees.id],
    }),
  })
);

export type MedicalCertificate = typeof medicalCertificates.$inferSelect;
export type NewMedicalCertificate = typeof medicalCertificates.$inferInsert;
