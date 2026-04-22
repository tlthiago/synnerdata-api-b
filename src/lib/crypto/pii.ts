import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto";
import { env } from "@/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

declare const encryptedStringBrand: unique symbol;
export type EncryptedString = string & {
  readonly [encryptedStringBrand]: true;
};

function deriveKey(salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(env.PII_ENCRYPTION_KEY, salt, 32, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

export const PII = {
  async encrypt(plaintext: string): Promise<EncryptedString> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await deriveKey(salt);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      salt.toString("hex"),
      iv.toString("hex"),
      tag.toString("hex"),
      encrypted.toString("hex"),
    ].join(":") as EncryptedString;
  },

  async decrypt(ciphertext: EncryptedString): Promise<string> {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid ciphertext format");
    }

    const [saltHex, ivHex, tagHex, encryptedHex] = parts;
    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const key = await deriveKey(salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  },

  isEncrypted(value: string): value is EncryptedString {
    const parts = value.split(":");
    if (parts.length !== 4) {
      return false;
    }

    const [salt, iv, tag] = parts;
    return (
      salt.length === SALT_LENGTH * 2 &&
      iv.length === IV_LENGTH * 2 &&
      tag.length === TAG_LENGTH * 2
    );
  },

  /**
   * Masking utilities for displaying PII data safely.
   */
  mask: {
    /**
     * Masks a CPF showing only the last 6 characters.
     * @example "12345678901" -> "***.***.78901"
     */
    cpf: (cpf: string): string => {
      const cleaned = cpf.replace(/\D/g, "");
      if (cleaned.length !== 11) {
        return "***.***.***-**";
      }
      return `***.***${cleaned.slice(-5, -2)}-${cleaned.slice(-2)}`;
    },

    /**
     * Masks an email showing only the first character and domain.
     * @example "john@example.com" -> "j***@example.com"
     */
    email: (email: string): string => {
      const parts = email.split("@");
      if (parts.length !== 2) {
        return "***@***.***";
      }
      const [local, domain] = parts;
      return `${local[0]}***@${domain}`;
    },

    /**
     * Masks a phone number showing only the last 4 digits.
     * @example "11999998888" -> "****8888"
     */
    phone: (phone: string): string => {
      const cleaned = phone.replace(/\D/g, "");
      if (cleaned.length < 4) {
        return "****";
      }
      return `****${cleaned.slice(-4)}`;
    },

    /**
     * Masks a PIS number showing only the last 4 digits.
     * @example "12345678901" -> "*******8901"
     */
    pis: (pis: string): string => {
      const cleaned = pis.replace(/\D/g, "");
      if (cleaned.length !== 11) {
        return "***********";
      }
      return `*******${cleaned.slice(-4)}`;
    },

    /**
     * Masks an RG showing only the last 3 digits.
     * @example "123456789" -> "******789"
     */
    rg: (rg: string): string => {
      const cleaned = rg.replace(/\D/g, "");
      if (cleaned.length < 3) {
        return "******";
      }
      return `${"*".repeat(cleaned.length - 3)}${cleaned.slice(-3)}`;
    },
  },
};
