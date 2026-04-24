const ALL_SAME_DIGITS_CPF = /^(\d)\1{10}$/;
const ALL_SAME_DIGITS_CNPJ = /^(\d)\1{13}$/;

/**
 * Validates a Brazilian CPF (Cadastro de Pessoas Físicas).
 * Uses the official validation algorithm with check digits.
 */
export function isValidCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, "");

  if (cleaned.length !== 11) {
    return false;
  }

  if (ALL_SAME_DIGITS_CPF.test(cleaned)) {
    return false;
  }

  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number.parseInt(cleaned[i], 10) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }
  if (remainder !== Number.parseInt(cleaned[9], 10)) {
    return false;
  }

  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number.parseInt(cleaned[i], 10) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }
  if (remainder !== Number.parseInt(cleaned[10], 10)) {
    return false;
  }

  return true;
}

/**
 * Validates a Brazilian CNPJ (Cadastro Nacional da Pessoa Jurídica).
 * Uses the official validation algorithm with check digits.
 */
export function isValidCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, "");

  if (cleaned.length !== 14) {
    return false;
  }

  if (ALL_SAME_DIGITS_CNPJ.test(cleaned)) {
    return false;
  }

  // Validate first check digit
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number.parseInt(cleaned[i], 10) * weights1[i];
  }
  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== Number.parseInt(cleaned[12], 10)) {
    return false;
  }

  // Validate second check digit
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number.parseInt(cleaned[i], 10) * weights2[i];
  }
  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;
  if (digit2 !== Number.parseInt(cleaned[13], 10)) {
    return false;
  }

  return true;
}

/**
 * Validates a Brazilian tax ID (CPF or CNPJ).
 * Automatically detects the type based on length.
 */
export function isValidTaxId(taxId: string): boolean {
  const cleaned = taxId.replace(/\D/g, "");

  if (cleaned.length === 11) {
    return isValidCPF(cleaned);
  }

  if (cleaned.length === 14) {
    return isValidCNPJ(cleaned);
  }

  return false;
}
