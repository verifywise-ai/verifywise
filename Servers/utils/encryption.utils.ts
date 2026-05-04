/**
 * Encryption utilities for sensitive data
 *
 * Uses AES-256-CBC encryption for API keys and other sensitive data.
 * Encryption key should be stored securely in environment variables.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default-key-change-this-in-production-32chars!!"; // Must be 32 characters
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Encrypt sensitive text
 *
 * @param text - Plain text to encrypt
 * @returns Encrypted text in format: iv:encryptedData
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error("Text to encrypt cannot be empty");
  }

  // Ensure encryption key is 32 bytes
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  // Return IV and encrypted data separated by colon
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt encrypted text
 *
 * @param encryptedText - Encrypted text in format: iv:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new Error("Text to decrypt cannot be empty");
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 2) {
    throw new Error("Invalid encrypted text format");
  }

  const [ivHex, encryptedData] = parts;
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
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
