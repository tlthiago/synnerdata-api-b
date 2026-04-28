import { APIError } from "better-auth/api";

const passwordComplexityRules = [
  { key: "uppercase", label: "uma letra maiúscula", test: /[A-Z]/ },
  { key: "lowercase", label: "uma letra minúscula", test: /[a-z]/ },
  { key: "number", label: "um número", test: /\d/ },
  {
    key: "special",
    label: "um caractere especial (!@#$%^&*...)",
    test: /[^A-Za-z0-9]/,
  },
] as const;

export function validatePasswordComplexity(password: string): void {
  const missing: string[] = [];

  for (const rule of passwordComplexityRules) {
    if (!rule.test.test(password)) {
      missing.push(rule.label);
    }
  }

  if (missing.length > 0) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_TOO_WEAK",
      message: `A senha deve conter: ${missing.join(", ")}.`,
    });
  }
}
