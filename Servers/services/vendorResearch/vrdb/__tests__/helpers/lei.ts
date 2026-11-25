/**
 * A made-up LEI for the tests: 18 characters that name no real entity, and the two check digits
 * ISO 17442 gives them (ISO 7064 MOD 97-10, letters read as 10 to 35).
 */
export function leiOf(base: string): string {
  const digits = `${base}00`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return `${base}${String(98 - rest).padStart(2, "0")}`;
}

/** The LEI of the tests' Acme Analytics. */
export const ACME_LEI = leiOf("TEST00ACMEANALYT01");
