/**
 * The identifiers of a vendor (spec Q1, M2 Task 2): its country, company registration number, LEI
 * and SEC CIK. Each is optional, is checked, and is stored in one form, so that a list's
 * identifier can be compared with it.
 */
import {
  ISO_COUNTRY_CODES,
  VENDOR_V1_ONLY_FIELDS,
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
  withoutV1OnlyVendorFields,
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

/**
 * ADR 0001 (sections 1 and 2): the other names and the identifiers are request fields that the
 * frozen legacy POST /api/vendors and PATCH /api/vendors/:id never had, so only the /api/v1 routes
 * take them. The legacy entry points drop them from the body before anything reads it.
 */
describe("withoutV1OnlyVendorFields", () => {
  const OTHERS = {
    vendor_name: "Acme",
    vendor_provides: "Payroll software",
    review_status: "In review",
    projects: [1, 2],
  };

  it("names the five fields, in this order", () => {
    expect(VENDOR_V1_ONLY_FIELDS).toEqual([
      "other_names",
      "country",
      "registration_number",
      "lei",
      "sec_cik",
    ]);
  });

  it("drops them and keeps every other field", () => {
    const body = {
      ...OTHERS,
      other_names: "Acme Analytics",
      country: "de",
      registration_number: "HRB 12345 B",
      lei: LEI,
      sec_cik: "320193",
    };

    // toStrictEqual: a key that is left behind with the value undefined is not dropped.
    expect(withoutV1OnlyVendorFields(body)).toStrictEqual(OTHERS);
  });

  it("drops them when they are null or an empty text too, which would clear a stored value", () => {
    const body = {
      ...OTHERS,
      other_names: "",
      country: null,
      registration_number: "   ",
      lei: "",
      sec_cik: null,
    };

    expect(withoutV1OnlyVendorFields(body)).toStrictEqual(OTHERS);
  });

  it("does not change the object it is given", () => {
    const body = Object.freeze({ ...OTHERS, other_names: "Acme Analytics", country: "de" });
    const before = { ...body };

    const kept = withoutV1OnlyVendorFields(body);

    expect(kept).not.toBe(body);
    expect(body).toStrictEqual(before);
  });

  it("returns what is not an object as it is, so that a malformed body is refused as it always was", () => {
    const list = [{ country: "de" }];

    expect(withoutV1OnlyVendorFields(undefined)).toBe(undefined);
    expect(withoutV1OnlyVendorFields(null)).toBe(null);
    expect(withoutV1OnlyVendorFields("country")).toBe("country");
    expect(withoutV1OnlyVendorFields(list)).toBe(list);
  });

  it("keeps a key named __proto__ as a key, and never makes it the prototype of the result", () => {
    const body = JSON.parse('{"__proto__":{"polluted":true},"vendor_name":"Acme","country":"de"}');

    const kept = withoutV1OnlyVendorFields(body);

    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
    expect(kept.polluted).toBeUndefined();
    expect(Object.keys(kept)).toEqual(["__proto__", "vendor_name"]);
  });
});
