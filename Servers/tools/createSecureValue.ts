import crypto from "crypto";
const algorithm = process.env.ENCRYPTION_ALGORITHM;
const password = process.env.ENCRYPTION_PASSWORD || "default-password";
const keyLength: number = 32; // 256 bits
const ivLength: number = 16;

interface EncryptedResult {
  value: string;
  iv: string;
}

interface DecryptionResult {
  success: boolean;
  data?: string;
  error?: string;
}

/**
 * Derives a key from password using scrypt
 */
const deriveKey = (salt: string = "default-salt"): Buffer => {
  return crypto.scryptSync(password, salt, keyLength);
};

/**
 * Encrypts text using AES-256-CBC
 */
const encryptText = (text: string): EncryptedResult => {
  if (!algorithm) {
    throw new Error("Encryption algorithm not specified in environment variables");
  }
  try {
    const key = deriveKey();
    const iv = crypto.randomBytes(ivLength);

    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return {
      value: encrypted,
      iv: iv.toString("hex"),
    };
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
};

/**
 * Decrypts data using AES-256-CBC
 */
const decryptText = (encryptedData: EncryptedResult): DecryptionResult => {
  if (!algorithm) {
    throw new Error("Encryption algorithm not specified in environment variables");
  }
  try {
    const { value, iv } = encryptedData;
    const key = deriveKey();

    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, "hex"));

    let decrypted = decipher.update(value, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return {
      success: true,
      data: decrypted,
    };
  } catch (error) {
    return {
      success: false,
      error: `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
};

export { encryptText, decryptText, EncryptedResult, DecryptionResult };
