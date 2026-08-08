import { describe, it, expect } from "@jest/globals";
import crypto from "crypto";
import { encrypt, decrypt, maskApiKey } from "../encryption.utils";

const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default-key-change-this-in-production-32chars!!";

function deriveKey(): Buffer {
  return Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
}

function legacyEncrypt(text: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

describe("encryption.utils", () => {
  describe("encrypt", () => {
    it("should encrypt text and return iv:authTag:encryptedData format", () => {
      const encrypted = encrypt("hello world");
      expect(encrypted).toContain(":");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      expect(parts[0]).toHaveLength(24); // GCM IV hex length = 12 bytes * 2
      expect(parts[1]).toHaveLength(32); // auth tag hex length = 16 bytes * 2
      expect(parts[2]).toBeTruthy();
    });

    it("should throw when text is empty", () => {
      expect(() => encrypt("")).toThrow("Text to encrypt cannot be empty");
    });

    it("should throw when text is undefined", () => {
      expect(() => encrypt(undefined as unknown as string)).toThrow(
        "Text to encrypt cannot be empty",
      );
    });
  });

  describe("decrypt", () => {
    it("should decrypt GCM-encrypted text back to original", () => {
      const original = "my secret message";
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it("should decrypt legacy CBC-encrypted text back to original", () => {
      const original = "legacy secret message";
      const encrypted = legacyEncrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it("should throw when encryptedText is empty", () => {
      expect(() => decrypt("")).toThrow("Text to decrypt cannot be empty");
    });

    it("should throw when encryptedText is undefined", () => {
      expect(() => decrypt(undefined as unknown as string)).toThrow(
        "Text to decrypt cannot be empty",
      );
    });

    it("should throw for invalid format without colon separator", () => {
      expect(() => decrypt("invalid-no-colon")).toThrow("Invalid encrypted text format");
    });

    it("should throw for invalid format with unsupported part count", () => {
      expect(() => decrypt("iv:data:extra:more")).toThrow("Invalid encrypted text format");
    });

    it("should throw for tampered GCM auth tag", () => {
      const original = "tamper test";
      const encrypted = encrypt(original);
      const [iv, tag, ct] = encrypted.split(":");
      const tamperedTag = (parseInt(tag[0], 16) ^ 1).toString(16) + tag.slice(1);
      expect(() => decrypt(`${iv}:${tamperedTag}:${ct}`)).toThrow();
    });
  });

  describe("maskApiKey", () => {
    it("should return xxx...xxx format for keys longer than 8 characters", () => {
      const key = "abcdefgh12345678";
      expect(maskApiKey(key)).toBe("abcd...5678");
    });

    it("should return *** for empty string", () => {
      expect(maskApiKey("")).toBe("***");
    });

    it("should return *** for short keys (<= 8 chars)", () => {
      expect(maskApiKey("short")).toBe("***");
      expect(maskApiKey("12345678")).toBe("***");
    });

    it("should return *** for null or undefined", () => {
      expect(maskApiKey(null as unknown as string)).toBe("***");
      expect(maskApiKey(undefined as unknown as string)).toBe("***");
    });
  });
});
