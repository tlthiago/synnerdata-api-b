export const EMPLOYEE_TIERS = [
  { min: 0, max: 10 },
  { min: 11, max: 20 },
  { min: 21, max: 30 },
  { min: 31, max: 40 },
  { min: 41, max: 50 },
  { min: 51, max: 60 },
  { min: 61, max: 70 },
  { min: 71, max: 80 },
  { min: 81, max: 90 },
  { min: 91, max: 180 },
] as const;

export const EMPLOYEE_TIERS_COUNT = EMPLOYEE_TIERS.length;
export const TRIAL_TIER = EMPLOYEE_TIERS[0];
export const TRIAL_TIERS_COUNT = 1;
export const MAX_EMPLOYEES = 180;
export const YEARLY_DISCOUNT = 0.2;
export const DEFAULT_TRIAL_DAYS = 14;
export const DEFAULT_TRIAL_EMPLOYEE_LIMIT = 10;

export const PLAN_FEATURES = {
  trial: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
    "payroll",
  ],
  gold: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
  ],
  diamond: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
  ],
  platinum: [
    "terminated_employees",
    "absences",
    "medical_certificates",
    "accidents",
    "warnings",
    "employee_status",
    "birthdays",
    "ppe",
    "employee_record",
    "payroll",
  ],
} as const;

export const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  terminated_employees: "Demitidos",
  absences: "Faltas",
  medical_certificates: "Atestados",
  accidents: "Acidentes",
  warnings: "Advertências",
  employee_status: "Status do Trabalhador",
  birthdays: "Aniversariantes",
  ppe: "EPI",
  employee_record: "Ficha Cadastral",
  payroll: "Folha",
};

export function calculateYearlyPrice(monthlyPrice: number): number {
  const yearlyFullPrice = monthlyPrice * 12;
  const discount = Math.round(yearlyFullPrice * YEARLY_DISCOUNT);
  return yearlyFullPrice - discount;
}
