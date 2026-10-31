import { createHmac, timingSafeEqual } from "crypto";

/** Secret key for signing CAPTCHA, resubmission and prefill tokens. */
const TOKEN_SECRET = process.env.JWT_SECRET || process.env.ENCRYPTION_KEY;
if (!TOKEN_SECRET) {
  throw new Error("JWT_SECRET or ENCRYPTION_KEY must be set for intake form token signing");
}

/** Create an HMAC-signed token from a payload object. */
export function createSignedToken(payload: Record<string, unknown>): string {
  const data = JSON.stringify(payload);
  const signature = createHmac("sha256", TOKEN_SECRET!).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, signature })).toString("base64");
}

/** Verify and decode an HMAC-signed token. Returns null if invalid. */
export function verifySignedToken<T = Record<string, unknown>>(token: string): T | null {
  try {
    const { data, signature } = JSON.parse(Buffer.from(token, "base64").toString());
    const expectedSignature = createHmac("sha256", TOKEN_SECRET!).update(data).digest("hex");
    // Use timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
