import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { branches } from "./branches";
import { costCenters } from "./cost-centers";
import { jobClassifications } from "./job-classifications";
import { jobPositions } from "./job-positions";
import { sectors } from "./sectors";

// Enums
export const contractTypeEnum = pgEnum("contract_type", ["CLT", "PJ"]);

export const educationLevelEnum = pgEnum("education_level", [
  "ELEMENTARY",
  "HIGH_SCHOOL",
  "BACHELOR",
  "POST_GRADUATE",
  "MASTER",
  "DOCTORATE",
]);

export const genderEnum = pgEnum("gender", [
  "MALE",
  "FEMALE",
  "NOT_DECLARED",
  "OTHER",
]);

export const maritalStatusEnum = pgEnum("marital_status", [
  "SINGLE",
  "MARRIED",
  "DIVORCED",
  "WIDOWED",
  "STABLE_UNION",
  "SEPARATED",
]);

export const workShiftEnum = pgEnum("work_shift", [
  "TWELVE_THIRTY_SIX",
  "SIX_ONE",
  "FIVE_TWO",
  "FOUR_THREE",
]);

export const employeeStatusEnum = pgEnum("employee_status", [
  "ACTIVE",
  "TERMINATED",
  "ON_LEAVE",
  "ON_VACATION",
  "VACATION_SCHEDULED",
  "TERMINATION_SCHEDULED",
]);

export const disabilityTypeEnum = pgEnum("disability_type", [
  "AUDITIVA",
  "VISUAL",
  "FISICA",
  "INTELECTUAL",
  "MENTAL",
  "MULTIPLA",
]);

export const employees = pgTable(
  "employees",
  {
    // Identification
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Personal Data
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    mobile: text("mobile"),
    birthDate: date("birth_date").notNull(),
    gender: genderEnum("gender").notNull(),
    maritalStatus: maritalStatusEnum("marital_status").notNull(),
    birthplace: text("birthplace"),
    nationality: text("nationality").notNull(),
    height: decimal("height", { precision: 4, scale: 2 }),
    weight: decimal("weight", { precision: 6, scale: 2 }),
    fatherName: text("father_name"),
    motherName: text("mother_name"),

    // Documents
    cpf: text("cpf").notNull(),
    identityCard: text("identity_card"),
    pis: text("pis"),
    workPermitNumber: text("work_permit_number"),
    workPermitSeries: text("work_permit_series"),
    militaryCertificate: text("military_certificate"),

    // Address
    street: text("street").notNull(),
    streetNumber: text("street_number").notNull(),
    complement: text("complement"),
    neighborhood: text("neighborhood").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zipCode: text("zip_code").notNull(),
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),

    // Employment
    hireDate: date("hire_date").notNull(),
    contractType: contractTypeEnum("contract_type").notNull(),
    salary: decimal("salary", { precision: 10, scale: 2 }).notNull(),
    status: employeeStatusEnum("status").default("ACTIVE").notNull(),
    manager: text("manager"),

    // Foreign Keys
    branchId: text("branch_id").references(() => branches.id),
    sectorId: text("sector_id")
      .notNull()
      .references(() => sectors.id),
    costCenterId: text("cost_center_id").references(() => costCenters.id),
    jobPositionId: text("job_position_id")
      .notNull()
      .references(() => jobPositions.id),
    jobClassificationId: text("job_classification_id")
      .notNull()
      .references(() => jobClassifications.id),

    // Work Schedule
    workShift: workShiftEnum("work_shift"),
    weeklyHours: decimal("weekly_hours", { precision: 5, scale: 2 }).notNull(),
    busCount: integer("bus_count"),

    // Benefits
    mealAllowance: decimal("meal_allowance", { precision: 10, scale: 2 }),
    transportAllowance: decimal("transport_allowance", {
      precision: 10,
      scale: 2,
    }),
    healthInsurance: decimal("health_insurance", { precision: 10, scale: 2 }),

    // Education and Special Needs
    educationLevel: educationLevelEnum("education_level"),
    hasSpecialNeeds: boolean("has_special_needs").notNull().default(false),
    disabilityType: disabilityTypeEnum("disability_type"),

    // Family
    hasChildren: boolean("has_children").notNull().default(false),
    childrenCount: integer("children_count"),
    hasChildrenUnder21: boolean("has_children_under_21"),

    // Health and Exams
    lastHealthExamDate: date("last_health_exam_date"),
    admissionExamDate: date("admission_exam_date"),
    terminationExamDate: date("termination_exam_date"),
    probation1ExpiryDate: date("probation1_expiry_date"),
    probation2ExpiryDate: date("probation2_expiry_date"),

    // Acquisition Period (manual seed)
    acquisitionPeriodStart: date("acquisition_period_start"),
    acquisitionPeriodEnd: date("acquisition_period_end"),

    // Audit
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("employees_organization_id_idx").on(table.organizationId),
    index("employees_cpf_idx").on(table.cpf),
    index("employees_name_idx").on(table.name),
    index("employees_status_idx").on(table.status),
    index("employees_branch_id_idx").on(table.branchId),
    index("employees_sector_id_idx").on(table.sectorId),
    index("employees_job_position_id_idx").on(table.jobPositionId),
    uniqueIndex("employees_cpf_org_unique_idx")
      .on(table.cpf, table.organizationId)
      .where(sql`deleted_at IS NULL AND status != 'TERMINATED'`),
  ]
);

export const employeeRelations = relations(employees, ({ one }) => ({
  organization: one(organizations, {
    fields: [employees.organizationId],
    references: [organizations.id],
  }),
  branch: one(branches, {
    fields: [employees.branchId],
    references: [branches.id],
  }),
  sector: one(sectors, {
    fields: [employees.sectorId],
    references: [sectors.id],
  }),
  costCenter: one(costCenters, {
    fields: [employees.costCenterId],
    references: [costCenters.id],
  }),
  jobPosition: one(jobPositions, {
    fields: [employees.jobPositionId],
    references: [jobPositions.id],
  }),
  jobClassification: one(jobClassifications, {
    fields: [employees.jobClassificationId],
    references: [jobClassifications.id],
  }),
}));

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
