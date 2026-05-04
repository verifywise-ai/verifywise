/**
 * PII Detection Utility
 *
 * Scans column headers for keywords that indicate personally identifiable
 * information (PII). Used during bulk dataset upload to auto-flag datasets.
 */

const PII_KEYWORDS = [
  "email",
  "e-mail",
  "ssn",
  "social_security",
  "social security",
  "phone",
  "telephone",
  "mobile",
  "address",
  "street",
  "zip",
  "postal",
  "name",
  "first_name",
  "last_name",
  "full_name",
  "firstname",
  "lastname",
  "dob",
  "date_of_birth",
  "birthdate",
  "birth_date",
  "salary",
  "income",
  "wage",
  "gender",
  "sex",
  "race",
  "ethnicity",
  "nationality",
  "passport",
  "credit_card",
  "creditcard",
  "card_number",
  "cvv",
  "bank_account",
  "account_number",
  "ip_address",
  "driver_license",
  "national_id",
];

export interface PiiDetectionResult {
  containsPii: boolean;
  piiColumns: string[];
}

/**
 * Scan column headers for PII keywords using case-insensitive substring matching.
 */
export function detectPiiInHeaders(headers: string[]): PiiDetectionResult {
  const piiColumns: string[] = [];

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    const isPii = PII_KEYWORDS.some(
      (keyword) => normalized.includes(keyword) || normalized === keyword,
    );
    if (isPii) {
      piiColumns.push(header);
    }
  }

  return {
    containsPii: piiColumns.length > 0,
    piiColumns,
  };
}
