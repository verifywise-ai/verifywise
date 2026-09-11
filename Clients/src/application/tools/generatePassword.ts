import { passwordValidation, PASSWORD_MIN_LENGTH } from "../validations/passwordValidation";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGIT = "0123456789";
const ALL = LOWER + UPPER + DIGIT;

function pick(chars: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return chars[buf[0] % chars.length];
}

function shuffle(input: string): string {
  const arr = input.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

/**
 * Generates a password guaranteed to satisfy the shared passwordValidation rule
 * (>=1 lowercase, >=1 uppercase, >=1 digit, length >= PASSWORD_MIN_LENGTH).
 */
export function generatePassword(length: number = 16): string {
  const len = Math.max(length, PASSWORD_MIN_LENGTH);
  let out = pick(LOWER) + pick(UPPER) + pick(DIGIT);
  for (let i = out.length; i < len; i++) out += pick(ALL);
  const result = shuffle(out);
  if (!passwordValidation(result).isValid) return generatePassword(len);
  return result;
}
