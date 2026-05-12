import { describe, it, expect } from "@jest/globals";
import { encrypt, decrypt, maskApiKey } from "../encryption.utils";

describe("encryption.utils", () => {
  describe("encrypt", () => {
    it("should encrypt text and return iv:encryptedData format", () => {
      const encrypted = encrypt("hello world");
      expect(encrypted).toContain(":");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toHaveLength(32); // IV hex length = 16 bytes * 2
      expect(parts[1]).toBeTruthy();
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
    it("should decrypt encrypted text back to original", () => {
      const original = "my secret message";
      const encrypted = encrypt(original);
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

    it("should throw for invalid format with too many colons", () => {
      expect(() => decrypt("iv:data:extra")).toThrow("Invalid encrypted text format");
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
