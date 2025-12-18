import { describe, expect, test } from "bun:test";
import { PII } from "@/lib/crypto/pii";

describe("PII", () => {
  describe("encrypt", () => {
    test("should encrypt plaintext and return formatted ciphertext", async () => {
      const plaintext = "12345678901";
      const ciphertext = await PII.encrypt(plaintext);

      // Format: salt:iv:tag:encrypted (all hex)
      const parts = ciphertext.split(":");
      expect(parts.length).toBe(4);

      // salt = 32 bytes = 64 hex chars
      expect(parts[0].length).toBe(64);
      // iv = 16 bytes = 32 hex chars
      expect(parts[1].length).toBe(32);
      // tag = 16 bytes = 32 hex chars
      expect(parts[2].length).toBe(32);
      // encrypted data exists
      expect(parts[3].length).toBeGreaterThan(0);
    });

    test("should produce different ciphertext for same input (random salt/IV)", async () => {
      const plaintext = "same-input-data";

      const ciphertext1 = await PII.encrypt(plaintext);
      const ciphertext2 = await PII.encrypt(plaintext);

      expect(ciphertext1).not.toBe(ciphertext2);
    });
  });

  describe("decrypt", () => {
    test("should decrypt ciphertext to original plaintext", async () => {
      const original = "sensitive-data-12345";
      const ciphertext = await PII.encrypt(original);
      const decrypted = await PII.decrypt(ciphertext);

      expect(decrypted).toBe(original);
    });

    test("should handle special characters", async () => {
      const original = "José da Silva - CPF: 123.456.789-01 (ção)";
      const ciphertext = await PII.encrypt(original);
      const decrypted = await PII.decrypt(ciphertext);

      expect(decrypted).toBe(original);
    });

    test("should handle empty string", async () => {
      const original = "";
      const ciphertext = await PII.encrypt(original);
      const decrypted = await PII.decrypt(ciphertext);

      expect(decrypted).toBe(original);
    });

    test("should throw error for invalid ciphertext format", async () => {
      await expect(PII.decrypt("invalid-format")).rejects.toThrow(
        "Invalid ciphertext format"
      );

      await expect(PII.decrypt("part1:part2")).rejects.toThrow(
        "Invalid ciphertext format"
      );

      await expect(PII.decrypt("a:b:c:d:e")).rejects.toThrow(
        "Invalid ciphertext format"
      );
    });

    test("should throw error for tampered ciphertext", async () => {
      const ciphertext = await PII.encrypt("original-data");
      const parts = ciphertext.split(":");

      // Tamper with the encrypted data
      const tamperedParts = [...parts];
      tamperedParts[3] = "00".repeat(parts[3].length / 2);
      const tampered = tamperedParts.join(":");

      await expect(PII.decrypt(tampered)).rejects.toThrow();
    });
  });

  describe("isEncrypted", () => {
    test("should return true for encrypted string", async () => {
      const ciphertext = await PII.encrypt("test-data");

      expect(PII.isEncrypted(ciphertext)).toBe(true);
    });

    test("should return false for plain string", () => {
      expect(PII.isEncrypted("12345678901")).toBe(false);
      expect(PII.isEncrypted("plain text data")).toBe(false);
      expect(PII.isEncrypted("")).toBe(false);
    });

    test("should return false for malformed string", () => {
      expect(PII.isEncrypted("a:b:c:d")).toBe(false);
      expect(PII.isEncrypted("short:parts:here:now")).toBe(false);

      // Wrong salt length (should be 64)
      expect(PII.isEncrypted("abc:def:ghi:jkl")).toBe(false);
    });
  });

  describe("mask", () => {
    describe("cpf", () => {
      test("should mask valid CPF showing last 5 digits", () => {
        expect(PII.mask.cpf("12345678901")).toBe("***.***789-01");
        expect(PII.mask.cpf("123.456.789-01")).toBe("***.***789-01");
      });

      test("should return default mask for invalid CPF", () => {
        expect(PII.mask.cpf("123")).toBe("***.***.***-**");
        expect(PII.mask.cpf("")).toBe("***.***.***-**");
        expect(PII.mask.cpf("12345678901234")).toBe("***.***.***-**");
      });
    });

    describe("email", () => {
      test("should mask valid email showing first char and domain", () => {
        expect(PII.mask.email("john@example.com")).toBe("j***@example.com");
        expect(PII.mask.email("alice.smith@company.org")).toBe(
          "a***@company.org"
        );
      });

      test("should return default mask for invalid email", () => {
        expect(PII.mask.email("invalid-email")).toBe("***@***.***");
        expect(PII.mask.email("")).toBe("***@***.***");
      });
    });

    describe("phone", () => {
      test("should mask valid phone showing last 4 digits", () => {
        expect(PII.mask.phone("11999998888")).toBe("****8888");
        expect(PII.mask.phone("(11) 99999-8888")).toBe("****8888");
        expect(PII.mask.phone("1199998888")).toBe("****8888");
      });

      test("should return default mask for short phone", () => {
        expect(PII.mask.phone("123")).toBe("****");
        expect(PII.mask.phone("")).toBe("****");
      });
    });

    describe("pis", () => {
      test("should mask valid PIS showing last 4 digits", () => {
        expect(PII.mask.pis("12345678901")).toBe("*******8901");
        expect(PII.mask.pis("123.45678.90-1")).toBe("*******8901");
      });

      test("should return default mask for invalid PIS", () => {
        expect(PII.mask.pis("123")).toBe("***********");
        expect(PII.mask.pis("")).toBe("***********");
        expect(PII.mask.pis("12345678901234")).toBe("***********");
      });
    });

    describe("rg", () => {
      test("should mask valid RG showing last 3 digits", () => {
        expect(PII.mask.rg("123456789")).toBe("******789");
        expect(PII.mask.rg("12.345.678-9")).toBe("******789");
        expect(PII.mask.rg("12345")).toBe("**345");
      });

      test("should return default mask for short RG", () => {
        expect(PII.mask.rg("12")).toBe("******");
        expect(PII.mask.rg("")).toBe("******");
      });
    });
  });
});
