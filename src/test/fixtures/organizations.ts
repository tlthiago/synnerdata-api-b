/**
 * Test organization data fixtures
 * These are template data - actual organizations are created dynamically via auth helper
 */

export const testOrgTemplates = {
  withProfile: {
    name: "Test Company",
    tradeName: "Test Company LTDA",
    taxId: "12345678000190", // Valid CNPJ format for testing
    phone: "11999999999",
    email: "billing@testcompany.com",
  },
  withoutProfile: {
    name: "New Company",
    // No billing profile yet - will be created during checkout
  },
};

/**
 * Test Brazilian document numbers (CPF/CNPJ)
 * These are valid format numbers for testing only
 */
export const testDocuments = {
  cnpj: {
    valid: "12345678000190",
    formatted: "12.345.678/0001-90",
  },
  cpf: {
    valid: "12345678901",
    formatted: "123.456.789-01",
  },
};

/**
 * Test phone numbers
 */
export const testPhones = {
  mobile: "11999999999",
  landline: "1133334444",
  formatted: "(11) 99999-9999",
};
