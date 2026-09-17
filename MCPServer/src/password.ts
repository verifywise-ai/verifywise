/**
 * Password generation for accounts created through this server.
 *
 * Must satisfy Servers/domain.layer/validations/password.valid.ts: at least 8
 * characters with a lowercase letter, an uppercase letter and a digit. Special
 * characters are recognised there but not required; the set used here is the
 * one that file's regex matches.
 */

import { randomInt } from "node:crypto";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SPECIAL = "!@#$%^&*";
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

const pick = (charset: string): string => charset[randomInt(charset.length)];

/**
 * Generate a password that always contains each required character class.
 *
 * Uses crypto.randomInt, not Math.random — these are real admin credentials.
 * Visually ambiguous characters (0/O, 1/l/I) are excluded because the password
 * is read off a screen and typed into a login form.
 */
export function generatePassword(length = 20): string {
  if (length < 8) {
    throw new Error("Password length must be at least 8 to meet the VerifyWise policy.");
  }

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < length) {
    chars.push(pick(ALL));
  }

  // Fisher-Yates over the same crypto source, so the guaranteed characters are
  // not pinned to the first four positions.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
