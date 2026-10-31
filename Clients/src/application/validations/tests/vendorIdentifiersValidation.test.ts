import {
  ISO_COUNTRY_CODES,
  checkCountry,
  checkLei,
  checkRegistrationNumber,
  checkSecCik,
} from "../vendorIdentifiersValidation";

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

const NONE = { accepted: true, message: "", value: null };

describe("checkCountry", () => {
  it("takes a two-letter code in either case and gives it in upper case", () => {
    expect(checkCountry("de")).toEqual({ accepted: true, message: "", value: "DE" });
    expect(checkCountry(" Fr ")).toEqual({ accepted: true, message: "", value: "FR" });
    expect(checkCountry("GB")).toEqual({ accepted: true, message: "", value: "GB" });
  });

  it.each([["XX"], ["DEU"], ["D1"], ["UK"], ["EU"], ["ZZ"], ["XK"], ["D"]])(
    "refuses %s, which is no country of ISO 3166-1, as the server does",
    (code) => {
      expect(checkCountry(code)).toEqual({
        accepted: false,
        message: "Country must be a two-letter ISO 3166-1 code, such as DE",
        value: null,
      });
    },
  );

  it.each([[""], ["   "]])("takes %p as no country", (value) => {
    expect(checkCountry(value)).toEqual(NONE);
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

describe("checkRegistrationNumber", () => {
  it("takes the number as the register writes it, with its white space made single", () => {
    expect(checkRegistrationNumber("  HRB   86891 ")).toEqual({
      accepted: true,
      message: "",
      value: "HRB 86891",
    });
  });

  it("takes 64 characters and refuses 65, counted once the white space is made single", () => {
    expect(checkRegistrationNumber("x".repeat(64)).accepted).toBe(true);
    expect(checkRegistrationNumber(`${"x".repeat(32)}     ${"x".repeat(31)}`).accepted).toBe(true);
    expect(checkRegistrationNumber("x".repeat(65))).toEqual({
      accepted: false,
      message: "Registration number must be at most 64 characters",
      value: null,
    });
  });

  it("takes an empty field as no number", () => {
    expect(checkRegistrationNumber("  ")).toEqual(NONE);
  });
});

describe("checkLei", () => {
  it("takes an LEI whose check digits match, without its spaces and in upper case", () => {
    const spaced = `${LEI.slice(0, 4)} ${LEI.slice(4, 10).toLowerCase()} ${LEI.slice(10)}`;

    expect(checkLei(LEI)).toEqual({ accepted: true, message: "", value: LEI });
    expect(checkLei(spaced)).toEqual({ accepted: true, message: "", value: LEI });
  });

  it("an LEI with wrong check digits is refused", () => {
    const changed = `${LEI.slice(0, 5)}${LEI[5] === "9" ? "8" : "9"}${LEI.slice(6)}`;
    const digits = `${BASE}${LEI.slice(18) === "00" ? "01" : "00"}`;

    for (const lei of [changed, digits]) {
      expect(checkLei(lei)).toEqual({
        accepted: false,
        message: "LEI check digits do not match",
        value: null,
      });
    }
  });

  it.each([[LEI.slice(0, 19)], [`${LEI}0`], [`${BASE}AB`], ["TEST00ACMEANALYT0-12"]])(
    "refuses %s, which is not 18 letters or digits and 2 digits",
    (lei) => {
      expect(checkLei(lei)).toEqual({
        accepted: false,
        message: "LEI must be 18 letters or digits followed by 2 check digits",
        value: null,
      });
    },
  );

  it("takes an empty field as no LEI", () => {
    expect(checkLei("")).toEqual(NONE);
  });
});

describe("checkSecCik", () => {
  it("a CIK is padded to ten digits", () => {
    expect(checkSecCik("98765")).toEqual({ accepted: true, message: "", value: "0000098765" });
    expect(checkSecCik(" 0000098765 ")).toEqual({
      accepted: true,
      message: "",
      value: "0000098765",
    });
    expect(checkSecCik("1234567890").value).toBe("1234567890");
  });

  it.each([["12345678901"], ["12a"], ["-5"], ["98 765"]])(
    "refuses %s, which is not one to ten digits",
    (cik) => {
      expect(checkSecCik(cik)).toEqual({
        accepted: false,
        message: "SEC CIK must be one to ten digits",
        value: null,
      });
    },
  );

  it("takes an empty field as no CIK", () => {
    expect(checkSecCik("")).toEqual(NONE);
  });
});
