/**
 * Encryption utilities for sensitive data
 *
 * Uses AES-256-GCM for new encryption. Decrypt supports both the legacy
 * AES-256-CBC format (iv:ciphertext) and the current GCM format
 * (iv:authTag:ciphertext) so existing secrets keep working.
 * Encryption key should be stored securely in environment variables.
 */

import crypto from "crypto";

const CURRENT_ALGORITHM = "aes-256-gcm";
const LEGACY_ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default-key-change-this-in-production-32chars!!"; // Must be 32 characters
const GCM_IV_LENGTH = 12; // AES-GCM standard nonce length
const GCM_AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  return Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
}

/**
 * Encrypt sensitive text
 *
 * @param text - Plain text to encrypt
 * @returns Encrypted text in format: iv:authTag:encryptedData
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error("Text to encrypt cannot be empty");
  }

  const key = deriveKey();
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(CURRENT_ALGORITHM, key, iv, {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });

  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/**
 * Decrypt encrypted text.
 *
 * Supports:
 *   - Current AES-256-GCM format: iv:authTag:ciphertext
 *   - Legacy AES-256-CBC format: iv:ciphertext
 *
 * @param encryptedText - Encrypted text
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new Error("Text to decrypt cannot be empty");
  }

  const parts = encryptedText.split(":");

  if (parts.length === 2) {
    // Legacy AES-256-CBC format
    const [ivHex, encryptedData] = parts;
    const key = deriveKey();
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedData, "hex")),
      decipher.final(),
    ]).toString("utf8");
  }

  if (parts.length === 3) {
    // Current AES-256-GCM format
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = deriveKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const decipher = crypto.createDecipheriv(CURRENT_ALGORITHM, key, iv, {
      authTagLength: GCM_AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  throw new Error("Invalid encrypted text format");
}

/**
 * Mask API key for display purposes
 *
 * @param apiKey - The API key to mask
 * @returns Masked key in format: xxxx...xxxx
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length <= 8) {
    return "***";
  }
  return `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`;
}
