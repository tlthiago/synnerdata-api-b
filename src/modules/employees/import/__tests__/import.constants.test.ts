import { describe, expect, test } from "bun:test";
import {
  BOOLEAN_LABELS,
  BRAZILIAN_STATES,
  buildReverseMap,
  CONTRACT_TYPE_LABELS,
  EDUCATION_LEVEL_LABELS,
  GENDER_LABELS,
  IMPORT_COLUMNS,
  MARITAL_STATUS_LABELS,
  MAX_IMPORT_ROWS,
  SHEET_NAME_DATA,
  SHEET_NAME_EMPLOYEES,
  WORK_SHIFT_LABELS,
} from "../import.constants";

// ---------------------------------------------------------------------------
// Sheet names & limits
// ---------------------------------------------------------------------------

describe("Sheet constants", () => {
  test("SHEET_NAME_EMPLOYEES is 'Funcionários'", () => {
    expect(SHEET_NAME_EMPLOYEES).toBe("Funcionários");
  });

  test("SHEET_NAME_DATA is 'Dados'", () => {
    expect(SHEET_NAME_DATA).toBe("Dados");
  });

  test("MAX_IMPORT_ROWS is 500", () => {
    expect(MAX_IMPORT_ROWS).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Enum label maps — completeness
// ---------------------------------------------------------------------------

describe("GENDER_LABELS", () => {
  test("contains all gender enum values", () => {
    const expected = ["MALE", "FEMALE", "NOT_DECLARED", "OTHER"];
    expect(Object.keys(GENDER_LABELS)).toEqual(expected);
  });

  test("labels are in Portuguese", () => {
    expect(GENDER_LABELS.MALE).toBe("Masculino");
    expect(GENDER_LABELS.FEMALE).toBe("Feminino");
    expect(GENDER_LABELS.NOT_DECLARED).toBe("Não declarado");
    expect(GENDER_LABELS.OTHER).toBe("Outro");
  });
});

describe("MARITAL_STATUS_LABELS", () => {
  test("contains all marital status enum values", () => {
    const expected = [
      "SINGLE",
      "MARRIED",
      "DIVORCED",
      "WIDOWED",
      "STABLE_UNION",
      "SEPARATED",
    ];
    expect(Object.keys(MARITAL_STATUS_LABELS)).toEqual(expected);
  });

  test("labels are in Portuguese", () => {
    expect(MARITAL_STATUS_LABELS.SINGLE).toBe("Solteiro(a)");
    expect(MARITAL_STATUS_LABELS.MARRIED).toBe("Casado(a)");
    expect(MARITAL_STATUS_LABELS.DIVORCED).toBe("Divorciado(a)");
    expect(MARITAL_STATUS_LABELS.WIDOWED).toBe("Viúvo(a)");
    expect(MARITAL_STATUS_LABELS.STABLE_UNION).toBe("União estável");
    expect(MARITAL_STATUS_LABELS.SEPARATED).toBe("Separado(a)");
  });
});

describe("CONTRACT_TYPE_LABELS", () => {
  test("contains all contract type enum values", () => {
    const expected = ["CLT", "PJ"];
    expect(Object.keys(CONTRACT_TYPE_LABELS)).toEqual(expected);
  });

  test("labels match the enum keys", () => {
    expect(CONTRACT_TYPE_LABELS.CLT).toBe("CLT");
    expect(CONTRACT_TYPE_LABELS.PJ).toBe("PJ");
  });
});

describe("EDUCATION_LEVEL_LABELS", () => {
  test("contains all education level enum values", () => {
    const expected = [
      "ELEMENTARY",
      "HIGH_SCHOOL",
      "BACHELOR",
      "POST_GRADUATE",
      "MASTER",
      "DOCTORATE",
    ];
    expect(Object.keys(EDUCATION_LEVEL_LABELS)).toEqual(expected);
  });

  test("labels are in Portuguese", () => {
    expect(EDUCATION_LEVEL_LABELS.ELEMENTARY).toBe("Ensino Fundamental");
    expect(EDUCATION_LEVEL_LABELS.HIGH_SCHOOL).toBe("Ensino Médio");
    expect(EDUCATION_LEVEL_LABELS.BACHELOR).toBe("Graduação");
    expect(EDUCATION_LEVEL_LABELS.POST_GRADUATE).toBe("Pós-graduação");
    expect(EDUCATION_LEVEL_LABELS.MASTER).toBe("Mestrado");
    expect(EDUCATION_LEVEL_LABELS.DOCTORATE).toBe("Doutorado");
  });
});

describe("WORK_SHIFT_LABELS", () => {
  test("contains all work shift enum values", () => {
    const expected = ["TWELVE_THIRTY_SIX", "SIX_ONE", "FIVE_TWO", "FOUR_THREE"];
    expect(Object.keys(WORK_SHIFT_LABELS)).toEqual(expected);
  });

  test("labels use compact notation", () => {
    expect(WORK_SHIFT_LABELS.TWELVE_THIRTY_SIX).toBe("12x36");
    expect(WORK_SHIFT_LABELS.SIX_ONE).toBe("6x1");
    expect(WORK_SHIFT_LABELS.FIVE_TWO).toBe("5x2");
    expect(WORK_SHIFT_LABELS.FOUR_THREE).toBe("4x3");
  });
});

describe("BOOLEAN_LABELS", () => {
  test("maps true/false to Sim/Não", () => {
    expect(BOOLEAN_LABELS.true).toBe("Sim");
    expect(BOOLEAN_LABELS.false).toBe("Não");
  });
});

// ---------------------------------------------------------------------------
// Brazilian states
// ---------------------------------------------------------------------------

describe("BRAZILIAN_STATES", () => {
  test("contains exactly 27 states", () => {
    expect(BRAZILIAN_STATES).toHaveLength(27);
  });

  test("is sorted alphabetically", () => {
    const sorted = [...BRAZILIAN_STATES].sort();
    expect(BRAZILIAN_STATES).toEqual(sorted);
  });

  test("includes all major states", () => {
    const expected = ["SP", "RJ", "MG", "BA", "DF", "RS", "PR", "AM"];
    for (const uf of expected) {
      expect(BRAZILIAN_STATES).toContain(uf);
    }
  });

  test("all entries are 2-character strings", () => {
    for (const uf of BRAZILIAN_STATES) {
      expect(uf).toHaveLength(2);
      expect(uf).toBe(uf.toUpperCase());
    }
  });
});

// ---------------------------------------------------------------------------
// buildReverseMap
// ---------------------------------------------------------------------------

describe("buildReverseMap", () => {
  test("inverts label map correctly", () => {
    const reverse = buildReverseMap(GENDER_LABELS);
    expect(reverse.masculino).toBe("MALE");
    expect(reverse.feminino).toBe("FEMALE");
    expect(reverse["não declarado"]).toBe("NOT_DECLARED");
    expect(reverse.outro).toBe("OTHER");
  });

  test("keys are lowercased", () => {
    const reverse = buildReverseMap(CONTRACT_TYPE_LABELS);
    expect(reverse.clt).toBe("CLT");
    expect(reverse.pj).toBe("PJ");
    // uppercase should not exist
    expect(reverse.CLT).toBeUndefined();
  });

  test("handles labels with accents and special characters", () => {
    const reverse = buildReverseMap(EDUCATION_LEVEL_LABELS);
    expect(reverse["pós-graduação"]).toBe("POST_GRADUATE");
    expect(reverse.graduação).toBe("BACHELOR");
  });

  test("trims whitespace from labels", () => {
    const mapWithSpaces = { KEY: "  Value With Spaces  " };
    const reverse = buildReverseMap(mapWithSpaces);
    expect(reverse["value with spaces"]).toBe("KEY");
  });

  test("returns empty object for empty input", () => {
    expect(buildReverseMap({})).toEqual({});
  });

  test("round-trips all enum maps", () => {
    const maps = [
      GENDER_LABELS,
      MARITAL_STATUS_LABELS,
      CONTRACT_TYPE_LABELS,
      EDUCATION_LEVEL_LABELS,
      WORK_SHIFT_LABELS,
    ];

    for (const labelMap of maps) {
      const reverse = buildReverseMap(labelMap);
      for (const [enumKey, label] of Object.entries(labelMap)) {
        expect(reverse[label.toLowerCase().trim()]).toBe(enumKey);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// IMPORT_COLUMNS — structure validation
// ---------------------------------------------------------------------------

describe("IMPORT_COLUMNS", () => {
  test("has more than 0 columns", () => {
    expect(IMPORT_COLUMNS.length).toBeGreaterThan(0);
  });

  test("every column has required properties", () => {
    for (const col of IMPORT_COLUMNS) {
      expect(typeof col.key).toBe("string");
      expect(col.key.length).toBeGreaterThan(0);
      expect(typeof col.header).toBe("string");
      expect(col.header.length).toBeGreaterThan(0);
      expect(typeof col.width).toBe("number");
      expect(col.width).toBeGreaterThan(0);
      expect(typeof col.required).toBe("boolean");
      expect(typeof col.section).toBe("string");
    }
  });

  test("column keys are unique", () => {
    const keys = IMPORT_COLUMNS.map((c) => c.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  test("column headers are unique", () => {
    const headers = IMPORT_COLUMNS.map((c) => c.header);
    const unique = new Set(headers);
    expect(unique.size).toBe(headers.length);
  });

  // ── Required fields match createEmployeeSchema ──

  const requiredFieldKeys = [
    "name",
    "email",
    "mobile",
    "birthDate",
    "gender",
    "maritalStatus",
    "birthplace",
    "nationality",
    "motherName",
    "cpf",
    "identityCard",
    "pis",
    "workPermitNumber",
    "workPermitSeries",
    "street",
    "streetNumber",
    "neighborhood",
    "city",
    "state",
    "zipCode",
    "hireDate",
    "contractType",
    "salary",
    "sectorId",
    "jobPositionId",
    "jobClassificationId",
    "workShift",
    "weeklyHours",
    "educationLevel",
    "hasSpecialNeeds",
    "hasChildren",
  ];

  const optionalFieldKeys = [
    "phone",
    "height",
    "weight",
    "fatherName",
    "militaryCertificate",
    "complement",
    "manager",
    "branchId",
    "costCenterId",
    "busCount",
    "mealAllowance",
    "transportAllowance",
    "disabilityType",
    "childrenCount",
    "hasChildrenUnder21",
    "lastHealthExamDate",
    "admissionExamDate",
    "terminationExamDate",
    "probation1ExpiryDate",
    "probation2ExpiryDate",
  ];

  test("all required fields from createEmployeeSchema are marked required", () => {
    for (const key of requiredFieldKeys) {
      const col = IMPORT_COLUMNS.find((c) => c.key === key);
      expect(col).toBeDefined();
      expect(col?.required).toBe(true);
    }
  });

  test("all optional fields from createEmployeeSchema are marked optional", () => {
    for (const key of optionalFieldKeys) {
      const col = IMPORT_COLUMNS.find((c) => c.key === key);
      expect(col).toBeDefined();
      expect(col?.required).toBe(false);
    }
  });

  test("total columns equal required + optional fields", () => {
    const totalExpected = requiredFieldKeys.length + optionalFieldKeys.length;
    expect(IMPORT_COLUMNS).toHaveLength(totalExpected);
  });

  // ── Sections ──

  test("uses only valid sections", () => {
    const validSections = new Set([
      "personal",
      "documents",
      "address",
      "employment",
      "schedule",
      "benefits",
      "education",
      "family",
      "health",
    ]);
    for (const col of IMPORT_COLUMNS) {
      expect(validSections.has(col.section)).toBe(true);
    }
  });

  // ── Dropdown validations ──

  test("enum columns have inline dropdowns", () => {
    const enumKeys = [
      "gender",
      "maritalStatus",
      "contractType",
      "educationLevel",
      "workShift",
    ];
    for (const key of enumKeys) {
      const col = IMPORT_COLUMNS.find((c) => c.key === key);
      expect(col?.dropdown).toBeDefined();
      expect(col?.dropdown?.type).toBe("inline");
    }
  });

  test("boolean columns have Sim/Não dropdowns", () => {
    const boolKeys = ["hasSpecialNeeds", "hasChildren", "hasChildrenUnder21"];
    for (const key of boolKeys) {
      const col = IMPORT_COLUMNS.find((c) => c.key === key);
      expect(col?.dropdown).toBeDefined();
      expect(col?.dropdown?.type).toBe("inline");
      if (col?.dropdown?.type === "inline") {
        expect(col.dropdown.values).toBe("Sim,Não");
      }
    }
  });

  test("state column has inline dropdown with all UFs", () => {
    const col = IMPORT_COLUMNS.find((c) => c.key === "state");
    expect(col?.dropdown).toBeDefined();
    expect(col?.dropdown?.type).toBe("inline");
    if (col?.dropdown?.type === "inline") {
      const values = col.dropdown.values.split(",");
      expect(values).toHaveLength(27);
    }
  });

  test("FK columns have reference dropdowns with correct refColumns", () => {
    const fkMappings: Record<string, string> = {
      sectorId: "A",
      jobPositionId: "B",
      jobClassificationId: "C",
      branchId: "D",
      costCenterId: "E",
    };

    for (const [key, refColumn] of Object.entries(fkMappings)) {
      const col = IMPORT_COLUMNS.find((c) => c.key === key);
      expect(col?.dropdown).toBeDefined();
      expect(col?.dropdown?.type).toBe("reference");
      if (col?.dropdown?.type === "reference") {
        expect(col.dropdown.refColumn).toBe(refColumn);
      }
    }
  });

  test("non-enum, non-FK columns have no dropdown", () => {
    const dropdownKeys = new Set([
      "gender",
      "maritalStatus",
      "contractType",
      "educationLevel",
      "workShift",
      "hasSpecialNeeds",
      "hasChildren",
      "hasChildrenUnder21",
      "state",
      "sectorId",
      "jobPositionId",
      "jobClassificationId",
      "branchId",
      "costCenterId",
    ]);

    for (const col of IMPORT_COLUMNS) {
      if (!dropdownKeys.has(col.key)) {
        expect(col.dropdown).toBeUndefined();
      }
    }
  });
});
