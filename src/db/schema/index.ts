import { absenceRelations, absences } from "./absences";
import { accidentRelations, accidents } from "./accidents";
import {
  adminOrgProvisionRelations,
  adminOrgProvisions,
} from "./admin-org-provisions";
import { auditLogRelations, auditLogs } from "./audit";
import {
  accountRelations,
  accounts,
  apikeys,
  apikeysRelations,
  invitationRelations,
  invitations,
  memberRelations,
  members,
  organizationRelations,
  organizations,
  sessionRelations,
  sessions,
  subscriptionRelations,
  subscriptions,
  twoFactorRelations,
  twoFactors,
  userRelations,
  users,
  verifications,
} from "./auth";
import { billingProfileRelations, billingProfiles } from "./billing-profiles";
import { branches, branchRelations } from "./branches";
import { costCenterRelations, costCenters } from "./cost-centers";
import { cpfAnalyses, cpfAnalysisRelations } from "./cpf-analyses";
import { employeeRelations, employees } from "./employees";
import {
  jobClassificationRelations,
  jobClassifications,
} from "./job-classifications";
import { jobPositionRelations, jobPositions } from "./job-positions";
import { laborLawsuitRelations, laborLawsuits } from "./labor-lawsuits";
import {
  medicalCertificateRelations,
  medicalCertificates,
} from "./medical-certificates";
import {
  organizationProfileRelations,
  organizationProfiles,
} from "./organization-profiles";
import {
  featureRelations,
  features,
  orgSubscriptionRelations,
  orgSubscriptions,
  pagarmePlanHistory,
  pagarmePlanHistoryRelations,
  pendingCheckoutRelations,
  pendingCheckouts,
  planFeatureRelations,
  planFeatures,
  planLimitRelations,
  planLimits,
  planPricingTiers,
  planPricingTiersRelations,
  priceAdjustmentRelations,
  priceAdjustments,
  subscriptionEventRelations,
  subscriptionEvents,
  subscriptionPlanRelations,
  subscriptionPlans,
} from "./payments";
import { ppeDeliveries, ppeDeliveryRelations } from "./ppe-deliveries";
import {
  ppeDeliveryItemRelations,
  ppeDeliveryItems,
} from "./ppe-delivery-items";
import { ppeDeliveryLogRelations, ppeDeliveryLogs } from "./ppe-delivery-logs";
import { ppeItemRelations, ppeItems } from "./ppe-items";
import { ppeJobPositionRelations, ppeJobPositions } from "./ppe-job-positions";
import {
  projectEmployeeRelations,
  projectEmployees,
} from "./project-employees";
import { projectRelations, projects } from "./projects";
import { promotionRelations, promotions } from "./promotions";
import { sectorRelations, sectors } from "./sectors";
import { terminationRelations, terminations } from "./terminations";
import { vacationRelations, vacations } from "./vacations";
import { warningRelations, warnings } from "./warnings";

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  twoFactors,
  organizations,
  members,
  invitations,
  subscriptions,
  apikeys,
  organizationProfiles,
  billingProfiles,
  branches,
  sectors,
  costCenters,
  jobClassifications,
  jobPositions,
  laborLawsuits,
  projects,
  projectEmployees,
  ppeItems,
  ppeJobPositions,
  ppeDeliveries,
  ppeDeliveryItems,
  ppeDeliveryLogs,
  employees,
  absences,
  accidents,
  cpfAnalyses,
  medicalCertificates,
  vacations,
  warnings,
  promotions,
  terminations,
  orgSubscriptions,
  subscriptionEvents,
  subscriptionPlans,
  planPricingTiers,
  pendingCheckouts,
  pagarmePlanHistory,
  priceAdjustments,
  features,
  planFeatures,
  planLimits,
  adminOrgProvisions,
  auditLogs,
};

export const fullSchema = {
  ...schema,
  userRelations,
  sessionRelations,
  accountRelations,
  organizationRelations,
  memberRelations,
  invitationRelations,
  subscriptionRelations,
  twoFactorRelations,
  apikeysRelations,
  organizationProfileRelations,
  billingProfileRelations,
  branchRelations,
  sectorRelations,
  costCenterRelations,
  jobClassificationRelations,
  jobPositionRelations,
  laborLawsuitRelations,
  projectRelations,
  projectEmployeeRelations,
  ppeItemRelations,
  ppeJobPositionRelations,
  ppeDeliveryRelations,
  ppeDeliveryItemRelations,
  ppeDeliveryLogRelations,
  employeeRelations,
  absenceRelations,
  accidentRelations,
  cpfAnalysisRelations,
  medicalCertificateRelations,
  vacationRelations,
  warningRelations,
  promotionRelations,
  terminationRelations,
  orgSubscriptionRelations,
  subscriptionEventRelations,
  subscriptionPlanRelations,
  planPricingTiersRelations,
  pendingCheckoutRelations,
  pagarmePlanHistoryRelations,
  priceAdjustmentRelations,
  featureRelations,
  planFeatureRelations,
  planLimitRelations,
  adminOrgProvisionRelations,
  auditLogRelations,
};

export type { Absence, NewAbsence } from "./absences";
export type { Accident, NewAccident } from "./accidents";
export type {
  AdminOrgProvision,
  NewAdminOrgProvision,
} from "./admin-org-provisions";
export { provisionStatusEnum, provisionTypeEnum } from "./admin-org-provisions";
export type { AuditLog, NewAuditLog } from "./audit";
export type { Role, SystemRole } from "./auth";
export { roleValues, systemRoleValues } from "./auth";
export type { BillingProfile, NewBillingProfile } from "./billing-profiles";
export type { Branch, NewBranch } from "./branches";
export type { CostCenter, NewCostCenter } from "./cost-centers";
export type { CpfAnalysis, NewCpfAnalysis } from "./cpf-analyses";
export type { Employee, NewEmployee } from "./employees";
export {
  contractTypeEnum,
  educationLevelEnum,
  employeeStatusEnum,
  genderEnum,
  maritalStatusEnum,
  workShiftEnum,
} from "./employees";
export type {
  JobClassification,
  NewJobClassification,
} from "./job-classifications";
export type { JobPosition, NewJobPosition } from "./job-positions";
export type { LaborLawsuit, NewLaborLawsuit } from "./labor-lawsuits";
export type {
  MedicalCertificate,
  NewMedicalCertificate,
} from "./medical-certificates";
export type {
  NewOrganizationProfile,
  OrganizationProfile,
} from "./organization-profiles";
export { organizationStatusEnum } from "./organization-profiles";
export type {
  Feature,
  NewFeature,
  NewOrgSubscription,
  NewPagarmePlanHistoryRecord,
  NewPendingCheckout,
  NewPlanFeature,
  NewPlanLimit,
  NewPlanPricingTier,
  NewPriceAdjustment,
  NewSubscriptionEvent,
  NewSubscriptionPlan,
  OrgSubscription,
  PagarmePlanHistoryRecord,
  PendingCheckout,
  PlanFeature,
  PlanLimit,
  PlanLimits,
  PlanPricingTier,
  PriceAdjustment,
  SubscriptionEvent,
  SubscriptionPlan,
} from "./payments";
export type { NewPpeDelivery, PpeDelivery } from "./ppe-deliveries";
export type { NewPpeDeliveryItem, PpeDeliveryItem } from "./ppe-delivery-items";
export type { NewPpeDeliveryLog, PpeDeliveryLog } from "./ppe-delivery-logs";
export { ppeDeliveryActionEnum } from "./ppe-delivery-logs";
export type { NewPpeItem, PpeItem } from "./ppe-items";
export type { NewPpeJobPosition, PpeJobPosition } from "./ppe-job-positions";
export type { NewProjectEmployee, ProjectEmployee } from "./project-employees";
export type { NewProject, Project } from "./projects";
export type { NewPromotion, Promotion } from "./promotions";
export type { NewSector, Sector } from "./sectors";
export type { NewTermination, Termination } from "./terminations";
export { terminationTypeEnum } from "./terminations";
export type { NewVacation, Vacation } from "./vacations";
export { vacationStatusEnum } from "./vacations";
export type { NewWarning, Warning } from "./warnings";
export { warningTypeEnum } from "./warnings";
