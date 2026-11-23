import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "fs";
import path from "path";
import {
  VENDOR_VALIDATION_LIMITS,
  normalizeOtherNames,
  normalizeRegistrationNumber,
  otherNamesIn,
  validateCountry,
  validateLei,
  validateOtherNames,
  validateRegistrationNumber,
  validateSecCik,
} from "../validations/vendorValidation.utils";

// The messages of the vendor identifiers and of the text fields of a vendor are thrown as
// ValidationExceptions and translated by their text (translateError), so each needs a key in the
// three dictionaries. They are read from the validators themselves, not written out, so that a
// message that changes in the code and not in the dictionaries fails here.
const IDENTIFIER_MESSAGES = [
  validateCountry(1).message,
  validateRegistrationNumber(1).message,
  validateLei(1).message,
  validateSecCik(1).message,
  validateCountry("XX").message,
  validateRegistrationNumber("A".repeat(65)).message,
  validateLei("SHORT").message,
  validateLei("TEST00ACMEANALYT0144").message,
  validateSecCik("12345678901").message,
];

/** The messages the vendor model and the v1 vendor routes throw for a text of the wrong type. */
const TEXT_TYPE_MESSAGES = [
  "Vendor name must be text",
  "Vendor provides must be text",
  "Website must be text",
  "Vendor contact person must be text",
  "Review result must be text",
  "The request body must be a JSON object",
];

const dictionary = (language: string): Record<string, string> =>
  JSON.parse(readFileSync(path.join(__dirname, "../../locales", `${language}.json`), "utf8"));
const DICTIONARIES: Record<string, Record<string, string>> = {
  en: dictionary("en"),
  de: dictionary("de"),
  fr: dictionary("fr"),
};

describe("the vendor messages in Servers/locales", () => {
  it("reads nine distinct identifier messages from the validators", () => {
    expect(new Set(IDENTIFIER_MESSAGES).size).toBe(9);
    for (const message of IDENTIFIER_MESSAGES) expect(typeof message).toBe("string");
  });

  it.each([...IDENTIFIER_MESSAGES, ...TEXT_TYPE_MESSAGES])(
    "%s has an entry in en, de and fr",
    (message) => {
      expect(DICTIONARIES.en[message!]).toBe(message);
      for (const language of ["de", "fr"]) {
        const translated = DICTIONARIES[language][message!];
        expect(typeof translated).toBe("string");
        // A German or French entry that is the English sentence is no translation.
        expect(translated).not.toBe(message);
      }
    },
  );
});

describe("the messages that name a limit", () => {
  // The messages are literals rather than templates of the limits, so that the i18n check of the
  // server messages (npm run i18n:check-en) finds each key. These hold each literal to the limit
  // the validator enforces, so that a limit that changes without its message fails here.
  const names = VENDOR_VALIDATION_LIMITS.OTHER_NAMES;
  const registrationMax = VENDOR_VALIDATION_LIMITS.REGISTRATION_NUMBER.MAX;

  it("names the registration number's limit, and refuses one character over it", () => {
    expect(validateRegistrationNumber("A".repeat(registrationMax)).isValid).toBe(true);
    expect(validateRegistrationNumber("A".repeat(registrationMax + 1)).message).toBe(
      `Registration number must be at most ${registrationMax} characters`,
    );
  });

  it("names the length limit of the other names", () => {
    expect(validateOtherNames("A".repeat(names.MAX_CHARS + 1)).message).toBe(
      `Other names must be at most ${names.MAX_CHARS} characters`,
    );
  });

  it("names the length limit of the stored other names", () => {
    // Semicolons between the names, which are stored with a comma and a space: the typed text
    // fits and the stored text does not.
    const typed = Array.from({ length: names.MAX_NAMES }, (_, i) =>
      `${String.fromCharCode(65 + i)}`.repeat(61),
    ).join(";");
    expect(typed.length).toBeLessThanOrEqual(names.MAX_CHARS);
    expect(normalizeOtherNames(typed)!.length).toBeGreaterThan(names.MAX_CHARS);
    expect(validateOtherNames(typed).message).toBe(
      `Other names must be at most ${names.MAX_CHARS} characters with a comma and a space between names`,
    );
  });

  it("names the limits of each other name", () => {
    expect(validateOtherNames("A".repeat(names.MIN_NAME_CHARS - 1)).message).toBe(
      `Each of the other names must be between ${names.MIN_NAME_CHARS} and ${names.MAX_NAME_CHARS} characters`,
    );
    expect(validateOtherNames("A".repeat(names.MAX_NAME_CHARS + 1)).message).toBe(
      `Each of the other names must be between ${names.MIN_NAME_CHARS} and ${names.MAX_NAME_CHARS} characters`,
    );
  });

  it("names the number of other names it takes", () => {
    const list = Array.from({ length: names.MAX_NAMES + 1 }, (_, i) => `Name ${i + 1}`).join("; ");
    expect(validateOtherNames(list).message).toBe(
      `Other names can list at most ${names.MAX_NAMES} names`,
    );
    const atLimit = Array.from({ length: names.MAX_NAMES }, (_, i) => `Name ${i + 1}`).join("; ");
    expect(validateOtherNames(atLimit).isValid).toBe(true);
  });
});

/** The C0 control characters other than white space, and DEL. */
const CONTROL = /[\u0000-\u0008\u000E-\u001F\u007F]/;

describe("control characters in the registration number", () => {
  // Postgres takes no NUL in a text, and Sequelize writes one in a replacement as the two characters
  // backslash and 0, so a NUL that passed the check was stored as another, longer text.
  const hostile = [
    `${"A".repeat(63)}\u0000`,
    `${"A".repeat(64)}\u0000`,
    "HRB\u000012345",
    "abc \u0000",
    "\u0000\u0001\u001F\u007F",
    "HRB\u0007 123\u001B45",
  ];

  it.each(hostile.map((value) => [JSON.stringify(value), value]))(
    "%s: a value that passes is stored without control characters and within 64 characters",
    (_label, value) => {
      const result = validateRegistrationNumber(value);
      const stored = normalizeRegistrationNumber(value);
      if (result.isValid) {
        if (stored !== null) {
          expect(stored).not.toMatch(CONTROL);
          expect(stored.length).toBeLessThanOrEqual(64);
        }
      } else {
        expect(result.message).toBe("Registration number must be at most 64 characters");
      }
    },
  );

  it("takes the control characters out of the stored text", () => {
    expect(validateRegistrationNumber(`${"A".repeat(63)}\u0000`)).toEqual({ isValid: true });
    expect(normalizeRegistrationNumber(`${"A".repeat(63)}\u0000`)).toBe("A".repeat(63));
    expect(normalizeRegistrationNumber("HRB\u000012345")).toBe("HRB12345");
    expect(normalizeRegistrationNumber("abc \u0000")).toBe("abc");
    expect(normalizeRegistrationNumber("\u0000\u0001")).toBeNull();
  });

  it("measures the cleaned text, so 64 characters and a NUL pass and 65 do not", () => {
    expect(validateRegistrationNumber(`${"A".repeat(64)}\u0000`)).toEqual({ isValid: true });
    expect(validateRegistrationNumber(`${"A".repeat(65)}\u0000`).isValid).toBe(false);
  });

  it("still collapses tabs and line breaks into one space", () => {
    expect(normalizeRegistrationNumber(" HRB\t\n12345 ")).toBe("HRB 12345");
  });
});

describe("control characters in the other names", () => {
  it("stores a name with a NUL in it without the NUL", () => {
    expect(validateOtherNames("Ac\u0000me")).toEqual({ isValid: true });
    expect(normalizeOtherNames("Ac\u0000me")).toBe("Acme");
  });

  it("measures each name after the control characters are taken out", () => {
    // "A" and a NUL is one character once cleaned, too short for a name.
    expect(validateOtherNames("A\u0000").isValid).toBe(false);
    expect(validateOtherNames(`${"B".repeat(80)}\u0000`)).toEqual({ isValid: true });
    expect(normalizeOtherNames(`${"B".repeat(80)}\u0000`)).toBe("B".repeat(80));
  });

  it("drops a name that is nothing but control characters", () => {
    expect(validateOtherNames("Acme, \u0000\u0001").isValid).toBe(true);
    expect(normalizeOtherNames("Acme, \u0000\u0001")).toBe("Acme");
  });

  it.each([
    ["Ac\u0000me, Init\u0007rode"],
    [`${"C".repeat(499)}\u0000`],
    ["\u001Fx\u001F, Meta\u007F"],
  ])("%j: a value that passes is stored without control characters", (value) => {
    if (!validateOtherNames(value).isValid) return;
    const stored = normalizeOtherNames(value);
    if (stored !== null) {
      expect(stored).not.toMatch(CONTROL);
      expect(stored.length).toBeLessThanOrEqual(500);
    }
  });

  it("leaves otherNamesIn as the form's copy has it: it does not clean", () => {
    expect(otherNamesIn("Ac\u0000me")).toEqual(["Ac\u0000me"]);
  });
});
