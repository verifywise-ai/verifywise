/**
 * The identifiers of a vendor (spec Q1, M2 Task 2): its country, company registration number, LEI
 * and SEC CIK. Each is optional, is checked, and is stored in one form, so that a list's
 * identifier can be compared with it.
 */
import {
  ISO_COUNTRY_CODES,
  createVendorSchema,
  normalizeCountry,
  normalizeLei,
  normalizeRegistrationNumber,
  normalizeSecCik,
  updateVendorSchema,
  validateCountry,
  validateLei,
  validateRegistrationNumber,
  validateSecCik,
  validateUpdateVendor,
  withNormalizedIdentifiers,
} from "../validations/vendorValidation.utils";

/** The ISO 7064 MOD 97-10 check digits of the first 18 characters of an LEI (ISO 17442). */
const checkDigitsOf = (base: string): string => {
  const digits = `${base}00`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return String(98 - rest).padStart(2, "0");
};
/** A made-up LEI: 18 characters of no real entity and their check digits. */
const BASE = "TEST00ACMEANALYT01";
const LEI = `${BASE}${checkDigitsOf(BASE)}`;

describe("validateCountry", () => {
  it("a country is two letters that name a region", () => {
    expect(validateCountry("de")).toEqual({ isValid: true });
    expect(normalizeCountry("de")).toBe("DE");
    expect(normalizeCountry(" fr ")).toBe("FR");
    for (const code of ["XX", "DEU", "D1", "UK", "EU", "ZZ"]) {
      expect(validateCountry(code)).toEqual({
        isValid: false,
        message: "Country must be a two-letter ISO 3166-1 code, such as DE",
        code: "INVALID_COUNTRY",
      });
    }
  });

  it("knows the 249 codes of ISO 3166-1, each of them a region with a name of its own", () => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    expect(ISO_COUNTRY_CODES).toHaveLength(249);
    expect(new Set(ISO_COUNTRY_CODES).size).toBe(249);
    for (const code of ISO_COUNTRY_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(names.of(code)).not.toBe(code);
      // Not an old code that stands for another one, as UK stands for GB.
      expect(Intl.getCanonicalLocales(`und-${code}`)).toEqual([`und-${code}`]);
    }
  });
});

describe("validateLei", () => {
  it("an LEI passes its check digits", () => {
    expect(validateLei(LEI)).toEqual({ isValid: true });
    const spaced = `${LEI.slice(0, 4)} ${LEI.slice(4, 10).toLowerCase()} ${LEI.slice(10)}`;
    expect(validateLei(spaced)).toEqual({ isValid: true });
    expect(normalizeLei(spaced)).toBe(LEI);

    const changed = `${LEI.slice(0, 5)}${LEI[5] === "9" ? "8" : "9"}${LEI.slice(6)}`;
    expect(validateLei(changed)).toEqual({
      isValid: false,
      message: "LEI check digits do not match",
      code: "INVALID_CHECK_DIGITS",
    });
  });

  it.each([[LEI.slice(0, 19)], [`${LEI}0`], [`${BASE}AB`], ["TEST00ACMEANALYT0-12"]])(
    "an LEI that is not 18 letters or digits and 2 digits is refused: %s",
    (value) => {
      expect(validateLei(value)).toEqual({
        isValid: false,
        message: "LEI must be 18 letters or digits followed by 2 check digits",
        code: "INVALID_FORMAT",
      });
    },
  );
});

describe("validateSecCik", () => {
  it("a CIK is one to ten digits, stored as ten", () => {
    expect(validateSecCik("320193")).toEqual({ isValid: true });
    expect(normalizeSecCik("320193")).toBe("0000320193");
    expect(normalizeSecCik(" 0000320193 ")).toBe("0000320193");
    for (const value of ["12a", "12345678901", "-1", "3 20193"]) {
      expect(validateSecCik(value)).toEqual({
        isValid: false,
        message: "SEC CIK must be one to ten digits",
        code: "INVALID_FORMAT",
      });
    }
  });
});

describe("validateRegistrationNumber", () => {
  it("a registration number is trimmed and at most 64 characters", () => {
    expect(normalizeRegistrationNumber("  HRB   12345 \n B ")).toBe("HRB 12345 B");
    expect(validateRegistrationNumber(` ${"x".repeat(64)} `)).toEqual({ isValid: true });
    expect(validateRegistrationNumber("x".repeat(65))).toEqual({
      isValid: false,
      message: "Registration number must be at most 64 characters",
      code: "TOO_LONG",
    });
  });
});

describe("every identifier", () => {
  const FIELDS = [
    ["Country", validateCountry, normalizeCountry],
    ["Registration number", validateRegistrationNumber, normalizeRegistrationNumber],
    ["LEI", validateLei, normalizeLei],
    ["SEC CIK", validateSecCik, normalizeSecCik],
  ] as const;

  it.each(FIELDS)("%s: an empty value is null", (_label, validate, normalize) => {
    for (const value of [undefined, null, "", "   "]) {
      expect(validate(value)).toEqual({ isValid: true });
      expect(normalize(value)).toBeNull();
    }
  });

  it.each(FIELDS)("%s: a value that is not text is refused", (label, validate) => {
    expect(validate(320193)).toEqual({
      isValid: false,
      message: `${label} must be text`,
      code: "INVALID_TYPE",
    });
  });

  it("is checked on creation and on update, and an update of one of them alone is an update", () => {
    for (const schema of [createVendorSchema, updateVendorSchema]) {
      expect(schema.country("XX").isValid).toBe(false);
      expect(schema.registration_number("x".repeat(65)).isValid).toBe(false);
      expect(schema.lei(LEI.slice(0, 19)).isValid).toBe(false);
      expect(schema.sec_cik("12a").isValid).toBe(false);
    }
    expect(validateUpdateVendor({ lei: LEI })).toEqual([]);
  });

  it("gives the change history the stored form of the identifiers, and leaves the rest", () => {
    expect(
      withNormalizedIdentifiers({ vendor_name: " Acme ", country: "de", sec_cik: "320193" }),
    ).toEqual({ vendor_name: " Acme ", country: "DE", sec_cik: "0000320193" });
    expect(withNormalizedIdentifiers({ lei: "" })).toEqual({ lei: null });
  });
});
