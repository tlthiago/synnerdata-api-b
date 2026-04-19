// ---------------------------------------------------------------------------
// Employee Import — Constants, Enum Label Maps & Column Definitions
// ---------------------------------------------------------------------------

// ── Sheet names ──────────────────────────────────────────────────────────────

export const SHEET_NAME_EMPLOYEES = "Funcionários";
export const SHEET_NAME_DATA = "Dados";

// ── Limits ───────────────────────────────────────────────────────────────────

export const MAX_IMPORT_ROWS = 500;

// ── Field key → PT-BR header map (for user-facing error messages) ───────────
// Built lazily after IMPORT_COLUMNS is defined — see bottom of file.

// ── PT-BR Enum Label Maps ────────────────────────────────────────────────────

export const GENDER_LABELS: Record<string, string> = {
  MALE: "Masculino",
  FEMALE: "Feminino",
  NOT_DECLARED: "Não declarado",
  OTHER: "Outro",
};

export const MARITAL_STATUS_LABELS: Record<string, string> = {
  SINGLE: "Solteiro(a)",
  MARRIED: "Casado(a)",
  DIVORCED: "Divorciado(a)",
  WIDOWED: "Viúvo(a)",
  STABLE_UNION: "União estável",
  SEPARATED: "Separado(a)",
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  CLT: "CLT",
  PJ: "PJ",
};

export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  ELEMENTARY: "Ensino Fundamental",
  HIGH_SCHOOL: "Ensino Médio",
  BACHELOR: "Graduação",
  POST_GRADUATE: "Pós-graduação",
  MASTER: "Mestrado",
  DOCTORATE: "Doutorado",
};

export const WORK_SHIFT_LABELS: Record<string, string> = {
  TWELVE_THIRTY_SIX: "12x36",
  SIX_ONE: "6x1",
  FIVE_TWO: "5x2",
  FOUR_THREE: "4x3",
};

export const DISABILITY_TYPE_LABELS: Record<string, string> = {
  AUDITIVA: "Auditiva",
  VISUAL: "Visual",
  FISICA: "Física",
  INTELECTUAL: "Intelectual",
  MENTAL: "Mental",
  MULTIPLA: "Múltipla",
};

export const BOOLEAN_LABELS: Record<string, string> = {
  true: "Sim",
  false: "Não",
};

// ── Brazilian States (UF) ────────────────────────────────────────────────────

export const BRAZILIAN_STATES = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

// ── Utility: Reverse Map ─────────────────────────────────────────────────────

/**
 * Builds a case-insensitive reverse lookup map from a label map.
 * Given `{ MALE: "Masculino" }` returns `{ masculino: "MALE" }`.
 * Keys are lowercased and trimmed for resilient matching.
 */
export const buildReverseMap = (
  labelMap: Record<string, string>
): Record<string, string> => {
  const reverse: Record<string, string> = {};
  for (const [key, value] of Object.entries(labelMap)) {
    reverse[value.toLowerCase().trim()] = key;
  }
  return reverse;
};

// ── Column Definition Types ──────────────────────────────────────────────────

type InlineDropdown = {
  type: "inline";
  values: string;
};

type ReferenceDropdown = {
  type: "reference";
  refColumn: string;
};

export type ImportColumnDropdown = InlineDropdown | ReferenceDropdown;

export type ImportColumnSection =
  | "personal"
  | "documents"
  | "address"
  | "employment"
  | "schedule"
  | "benefits"
  | "education"
  | "family"
  | "health";

export type ImportColumn = {
  key: string;
  header: string;
  width: number;
  required: boolean;
  section: ImportColumnSection;
  dropdown?: ImportColumnDropdown;
};

// ── Helper: comma-separate label values ──────────────────────────────────────

const inlineValues = (labelMap: Record<string, string>): string =>
  Object.values(labelMap).join(",");

const booleanValues = inlineValues(BOOLEAN_LABELS);

// ── Column Definitions ───────────────────────────────────────────────────────
// Order matches the intended column order in the Excel template.
// FK columns use `type: "reference"` pointing at columns on the hidden "Dados" sheet.

export const IMPORT_COLUMNS: ImportColumn[] = [
  // ── Personal ──
  {
    key: "name",
    header: "Nome completo",
    width: 30,
    required: true,
    section: "personal",
  },
  {
    key: "email",
    header: "Email",
    width: 28,
    required: false,
    section: "personal",
  },
  {
    key: "phone",
    header: "Telefone fixo",
    width: 15,
    required: false,
    section: "personal",
  },
  {
    key: "mobile",
    header: "Celular",
    width: 15,
    required: false,
    section: "personal",
  },
  {
    key: "birthDate",
    header: "Data de nascimento",
    width: 18,
    required: true,
    section: "personal",
  },
  {
    key: "gender",
    header: "Sexo",
    width: 16,
    required: true,
    section: "personal",
    dropdown: { type: "inline", values: inlineValues(GENDER_LABELS) },
  },
  {
    key: "maritalStatus",
    header: "Estado civil",
    width: 16,
    required: true,
    section: "personal",
    dropdown: {
      type: "inline",
      values: inlineValues(MARITAL_STATUS_LABELS),
    },
  },
  {
    key: "birthplace",
    header: "Naturalidade",
    width: 20,
    required: false,
    section: "personal",
  },
  {
    key: "nationality",
    header: "Nacionalidade",
    width: 18,
    required: true,
    section: "personal",
  },
  {
    key: "height",
    header: "Altura (m)",
    width: 12,
    required: false,
    section: "personal",
  },
  {
    key: "weight",
    header: "Peso (kg)",
    width: 12,
    required: false,
    section: "personal",
  },
  {
    key: "fatherName",
    header: "Nome do pai",
    width: 30,
    required: false,
    section: "personal",
  },
  {
    key: "motherName",
    header: "Nome da mãe",
    width: 30,
    required: false,
    section: "personal",
  },

  // ── Documents ──
  {
    key: "cpf",
    header: "CPF",
    width: 15,
    required: true,
    section: "documents",
  },
  {
    key: "identityCard",
    header: "RG",
    width: 18,
    required: false,
    section: "documents",
  },
  {
    key: "pis",
    header: "PIS",
    width: 15,
    required: false,
    section: "documents",
  },
  {
    key: "workPermitNumber",
    header: "CTPS - Número",
    width: 15,
    required: false,
    section: "documents",
  },
  {
    key: "workPermitSeries",
    header: "CTPS - Série",
    width: 15,
    required: false,
    section: "documents",
  },
  {
    key: "militaryCertificate",
    header: "Certificado de reservista",
    width: 22,
    required: false,
    section: "documents",
  },

  // ── Address ──
  {
    key: "street",
    header: "Rua",
    width: 30,
    required: true,
    section: "address",
  },
  {
    key: "streetNumber",
    header: "Número",
    width: 10,
    required: true,
    section: "address",
  },
  {
    key: "complement",
    header: "Complemento",
    width: 20,
    required: false,
    section: "address",
  },
  {
    key: "neighborhood",
    header: "Bairro",
    width: 20,
    required: true,
    section: "address",
  },
  {
    key: "city",
    header: "Cidade",
    width: 20,
    required: true,
    section: "address",
  },
  {
    key: "state",
    header: "UF",
    width: 8,
    required: true,
    section: "address",
    dropdown: { type: "inline", values: BRAZILIAN_STATES.join(",") },
  },
  {
    key: "zipCode",
    header: "CEP",
    width: 12,
    required: true,
    section: "address",
  },
  {
    key: "latitude",
    header: "Latitude",
    width: 14,
    required: false,
    section: "address",
  },
  {
    key: "longitude",
    header: "Longitude",
    width: 14,
    required: false,
    section: "address",
  },

  // ── Employment ──
  {
    key: "hireDate",
    header: "Data de admissão",
    width: 18,
    required: true,
    section: "employment",
  },
  {
    key: "contractType",
    header: "Tipo de contrato",
    width: 16,
    required: true,
    section: "employment",
    dropdown: {
      type: "inline",
      values: inlineValues(CONTRACT_TYPE_LABELS),
    },
  },
  {
    key: "salary",
    header: "Salário",
    width: 14,
    required: true,
    section: "employment",
  },
  {
    key: "manager",
    header: "Gestor",
    width: 30,
    required: false,
    section: "employment",
  },
  {
    key: "sectorId",
    header: "Setor",
    width: 25,
    required: true,
    section: "employment",
    dropdown: { type: "reference", refColumn: "A" },
  },
  {
    key: "jobPositionId",
    header: "Função",
    width: 25,
    required: true,
    section: "employment",
    dropdown: { type: "reference", refColumn: "B" },
  },
  {
    key: "jobClassificationId",
    header: "CBO",
    width: 25,
    required: true,
    section: "employment",
    dropdown: { type: "reference", refColumn: "C" },
  },
  {
    key: "branchId",
    header: "Filial",
    width: 25,
    required: false,
    section: "employment",
    dropdown: { type: "reference", refColumn: "D" },
  },
  {
    key: "costCenterId",
    header: "Centro de custo",
    width: 25,
    required: false,
    section: "employment",
    dropdown: { type: "reference", refColumn: "E" },
  },
  {
    key: "acquisitionPeriodStart",
    header: "Início Período Aquisitivo",
    width: 22,
    required: false,
    section: "employment",
  },
  {
    key: "acquisitionPeriodEnd",
    header: "Fim Período Aquisitivo",
    width: 22,
    required: false,
    section: "employment",
  },

  // ── Schedule ──
  {
    key: "workShift",
    header: "Escala de trabalho",
    width: 18,
    required: false,
    section: "schedule",
    dropdown: {
      type: "inline",
      values: inlineValues(WORK_SHIFT_LABELS),
    },
  },
  {
    key: "weeklyHours",
    header: "Carga horária semanal",
    width: 20,
    required: true,
    section: "schedule",
  },
  {
    key: "busCount",
    header: "Qtd. ônibus",
    width: 14,
    required: false,
    section: "schedule",
  },

  // ── Benefits ──
  {
    key: "mealAllowance",
    header: "Vale alimentação",
    width: 18,
    required: false,
    section: "benefits",
  },
  {
    key: "transportAllowance",
    header: "Vale transporte",
    width: 18,
    required: false,
    section: "benefits",
  },
  {
    key: "healthInsurance",
    header: "Plano de saúde",
    width: 18,
    required: false,
    section: "benefits",
  },

  // ── Education ──
  {
    key: "educationLevel",
    header: "Grau de instrução",
    width: 20,
    required: false,
    section: "education",
    dropdown: {
      type: "inline",
      values: inlineValues(EDUCATION_LEVEL_LABELS),
    },
  },
  {
    key: "hasSpecialNeeds",
    header: "Possui necessidades especiais",
    width: 28,
    required: false,
    section: "education",
    dropdown: { type: "inline", values: booleanValues },
  },
  {
    key: "disabilityType",
    header: "Tipo de deficiência",
    width: 22,
    required: false,
    section: "education",
    dropdown: {
      type: "inline",
      values: inlineValues(DISABILITY_TYPE_LABELS),
    },
  },

  // ── Family ──
  {
    key: "hasChildren",
    header: "Possui filhos",
    width: 14,
    required: false,
    section: "family",
    dropdown: { type: "inline", values: booleanValues },
  },
  {
    key: "childrenCount",
    header: "Qtd. filhos",
    width: 12,
    required: false,
    section: "family",
  },
  {
    key: "hasChildrenUnder21",
    header: "Filhos menores de 21",
    width: 20,
    required: false,
    section: "family",
    dropdown: { type: "inline", values: booleanValues },
  },

  // ── Health ──
  {
    key: "lastHealthExamDate",
    header: "Data do último ASO",
    width: 18,
    required: false,
    section: "health",
  },
  {
    key: "admissionExamDate",
    header: "Data do exame admissional",
    width: 24,
    required: false,
    section: "health",
  },
  {
    key: "terminationExamDate",
    header: "Data do exame demissional",
    width: 24,
    required: false,
    section: "health",
  },
];

// ── Field key → PT-BR header map ────────────────────────────────────────────

export const FIELD_KEY_TO_HEADER: Record<string, string> = Object.fromEntries(
  IMPORT_COLUMNS.map((col) => [col.key, col.header])
);
