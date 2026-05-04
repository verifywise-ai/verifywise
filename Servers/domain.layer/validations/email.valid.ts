/**
 * Validates whether the given string is a valid email address.
 *
 * This function uses a multi-stage approach to prevent ReDoS attacks while
 * maintaining reasonable email validation accuracy.
 *
 * @param email - The email address to validate.
 * @returns `true` if the email address is valid, `false` otherwise.
 */

export function emailValidation(email: string): boolean {
  // Input sanitization and length limits (RFC 5321 compliance)
  if (!email || typeof email !== "string") {
    return false;
  }

  // RFC 5321 specifies maximum length of 254 characters for email addresses
  if (email.length > 254) {
    return false;
  }

  // RFC 5322 local part max 64 characters, domain part max 255 characters
  // But total length must be <= 254, so we check local part specifically
  const [localPart, ...domainParts] = email.split("@");

  // Basic structure validation
  if (domainParts.length !== 1 || !localPart || !domainParts[0]) {
    return false;
  }

  if (localPart.length > 64) {
    return false;
  }

  const domain = domainParts.join("@");

  // Secure regex patterns that avoid catastrophic backtracking
  // Using atomic groups and possessive quantifiers where supported
  // These patterns are designed for linear time complexity O(n)

  // Local part: allowed characters without ambiguous patterns
  const localPartRegex = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;

  // Domain part: simplified but effective validation
  // Split domain into labels for validation
  const domainLabels = domain.split(".");

  // Domain must have at least 2 labels (e.g., example.com)
  if (domainLabels.length < 2) {
    return false;
  }

  // Each domain label validation
  const domainLabelRegex = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
  const tldRegex = /^[A-Za-z]{2,}$/;

  // Validate each domain label
  for (let i = 0; i < domainLabels.length - 1; i++) {
    const label = domainLabels[i];
    if (label.length === 0 || label.length > 63) {
      return false;
    }
    if (!domainLabelRegex.test(label)) {
      return false;
    }
  }

  // Validate TLD (last label)
  const tld = domainLabels[domainLabels.length - 1];
  if (tld.length === 0 || tld.length > 63) {
    return false;
  }
  if (!tldRegex.test(tld)) {
    return false;
  }

  // Validate local part
  return localPartRegex.test(localPart);
}
