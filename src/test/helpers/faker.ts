import { fakerPT_BR } from "@faker-js/faker";

// Re-export faker with pt-BR locale
export const faker = fakerPT_BR;

/**
 * Generates a valid Brazilian CPF (11 digits, numbers only).
 * Note: This generates a random 11-digit number, not a mathematically valid CPF.
 */
export function generateCpf(): string {
  return faker.string.numeric(11);
}

/**
 * Generates a valid Brazilian CNPJ (14 digits, numbers only).
 * Note: This generates a random 14-digit number, not a mathematically valid CNPJ.
 */
export function generateCnpj(): string {
  return faker.string.numeric(14);
}

/**
 * Generates a Brazilian PIS number (11 digits).
 */
export function generatePis(): string {
  return faker.string.numeric(11);
}

/**
 * Generates a Brazilian CEP (8 digits).
 */
export function generateCep(): string {
  return faker.string.numeric(8);
}

/**
 * Generates a Brazilian phone number (11 digits for mobile).
 */
export function generateMobile(): string {
  const ddd = faker.helpers.arrayElement([
    "11",
    "21",
    "31",
    "41",
    "51",
    "61",
    "71",
    "81",
    "85",
    "62",
  ]);
  return `${ddd}9${faker.string.numeric(8)}`;
}

/**
 * Generates a Brazilian state abbreviation.
 */
export function generateState(): string {
  return faker.helpers.arrayElement([
    "AC",
    "AL",
    "AP",
    "AM",
    "BA",
    "CE",
    "DF",
    "ES",
    "GO",
    "MA",
    "MT",
    "MS",
    "MG",
    "PA",
    "PB",
    "PR",
    "PE",
    "PI",
    "RJ",
    "RN",
    "RS",
    "RO",
    "RR",
    "SC",
    "SP",
    "SE",
    "TO",
  ]);
}

/**
 * Generates a birth date for an adult (18-65 years old).
 */
export function generateAdultBirthDate(): string {
  const date = faker.date.birthdate({ min: 18, max: 65, mode: "age" });
  return date.toISOString().split("T")[0];
}

/**
 * Generates a past date within the last 5 years (for hire dates).
 */
export function generateHireDate(): string {
  const date = faker.date.past({ years: 5 });
  return date.toISOString().split("T")[0];
}
