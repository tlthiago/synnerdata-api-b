import { describe, expect, test } from "bun:test";
import { isValidCNPJ, isValidCPF, isValidTaxId } from "../document-validators";

describe("isValidCPF", () => {
  test("returns true for valid CPF", () => {
    expect(isValidCPF("52998224725")).toBe(true);
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("11144477735")).toBe(true);
  });

  test("returns false for invalid check digits", () => {
    expect(isValidCPF("52998224726")).toBe(false);
    expect(isValidCPF("52998224724")).toBe(false);
    expect(isValidCPF("12345678901")).toBe(false);
  });

  test("returns false for wrong length", () => {
    expect(isValidCPF("1234567890")).toBe(false);
    expect(isValidCPF("123456789012")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });

  test("returns false for all same digits", () => {
    expect(isValidCPF("00000000000")).toBe(false);
    expect(isValidCPF("11111111111")).toBe(false);
    expect(isValidCPF("22222222222")).toBe(false);
    expect(isValidCPF("99999999999")).toBe(false);
  });
});

describe("isValidCNPJ", () => {
  test("returns true for valid CNPJ", () => {
    expect(isValidCNPJ("11222333000181")).toBe(true);
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("42591651000143")).toBe(true);
  });

  test("returns false for invalid check digits", () => {
    expect(isValidCNPJ("11222333000182")).toBe(false);
    expect(isValidCNPJ("11222333000180")).toBe(false);
    expect(isValidCNPJ("12345678000190")).toBe(false);
  });

  test("returns false for wrong length", () => {
    expect(isValidCNPJ("1122233300018")).toBe(false);
    expect(isValidCNPJ("112223330001811")).toBe(false);
    expect(isValidCNPJ("")).toBe(false);
  });

  test("returns false for all same digits", () => {
    expect(isValidCNPJ("00000000000000")).toBe(false);
    expect(isValidCNPJ("11111111111111")).toBe(false);
    expect(isValidCNPJ("99999999999999")).toBe(false);
  });
});

describe("isValidTaxId", () => {
  test("validates CPF when 11 digits", () => {
    expect(isValidTaxId("52998224725")).toBe(true);
    expect(isValidTaxId("529.982.247-25")).toBe(true);
    expect(isValidTaxId("12345678901")).toBe(false);
  });

  test("validates CNPJ when 14 digits", () => {
    expect(isValidTaxId("11222333000181")).toBe(true);
    expect(isValidTaxId("11.222.333/0001-81")).toBe(true);
    expect(isValidTaxId("12345678000190")).toBe(false);
  });

  test("returns false for invalid length", () => {
    expect(isValidTaxId("1234567890")).toBe(false);
    expect(isValidTaxId("123456789012")).toBe(false);
    expect(isValidTaxId("1234567890123")).toBe(false);
    expect(isValidTaxId("123456789012345")).toBe(false);
    expect(isValidTaxId("")).toBe(false);
  });
});
