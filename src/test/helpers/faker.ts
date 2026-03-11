import { fakerPT_BR } from "@faker-js/faker";

// Re-export faker with pt-BR locale
export const faker = fakerPT_BR;

/**
 * Generates a valid Brazilian CPF with correct check digits.
 */
export function generateCpf(): string {
  const digits = Array.from({ length: 9 }, () =>
    faker.number.int({ min: 0, max: 9 })
  );

  // First check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += digits[i] * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  digits.push(remainder >= 10 ? 0 : remainder);

  // Second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * (11 - i);
  }
  remainder = (sum * 10) % 11;
  digits.push(remainder >= 10 ? 0 : remainder);

  return digits.join("");
}

/**
 * Generates a valid Brazilian CNPJ with correct check digits.
 */
export function generateCnpj(): string {
  const digits = Array.from({ length: 12 }, () =>
    faker.number.int({ min: 0, max: 9 })
  );

  // First check digit
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * weights1[i];
  }
  let remainder = sum % 11;
  digits.push(remainder < 2 ? 0 : 11 - remainder);

  // Second check digit
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += digits[i] * weights2[i];
  }
  remainder = sum % 11;
  digits.push(remainder < 2 ? 0 : 11 - remainder);

  return digits.join("");
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
 * Generates a Brazilian landline phone number (10 digits).
 */
export function generatePhone(): string {
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
  return `${ddd}${faker.string.numeric(8)}`;
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

/**
 * Generates a past date relative to a reference date (for exam dates, etc.).
 */
export function generatePastDateFrom(
  refDate: string,
  maxDaysAfter: number
): string {
  const ref = new Date(refDate);
  const daysAfter = faker.number.int({ min: 0, max: maxDaysAfter });
  ref.setDate(ref.getDate() + daysAfter);
  return ref.toISOString().split("T")[0];
}

/**
 * Generates a Brazilian latitude (roughly -33 to 5).
 */
export function generateLatitude(): number {
  return faker.number.float({ min: -33.75, max: 5.27, fractionDigits: 6 });
}

/**
 * Generates a Brazilian longitude (roughly -73 to -34).
 */
export function generateLongitude(): number {
  return faker.number.float({ min: -73.99, max: -34.79, fractionDigits: 6 });
}
