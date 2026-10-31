import {
  VENDOR_VALIDATION_LIMITS,
  normalizeOtherNames,
  updateVendorSchema,
  createVendorSchema,
  validateOtherNames,
  validateUpdateVendor,
} from "../validations/vendorValidation.utils";

describe("the limits of the other names of a vendor", () => {
  it("allows 500 characters in all, 8 names, and 2 to 80 characters in a name", () => {
    expect(VENDOR_VALIDATION_LIMITS.OTHER_NAMES).toEqual({
      MAX_CHARS: 500,
      MAX_NAMES: 8,
      MIN_NAME_CHARS: 2,
      MAX_NAME_CHARS: 80,
    });
  });
});

describe("validateOtherNames", () => {
  it.each([[undefined], [null], [""], ["   "], [" , ; ,\n"]])(
    "accepts %p: a vendor needs none",
    (value) => {
      expect(validateOtherNames(value)).toEqual({ isValid: true });
    },
  );

  it("accepts names separated by commas, semicolons and line breaks", () => {
    expect(validateOtherNames("Facebook, Instagram;  WhatsApp\nMeta Quest\r\nMessenger")).toEqual({
      isValid: true,
    });
  });

  it.each([[42], [true], [["Facebook"]], [{ name: "Facebook" }]])(
    "refuses %p: it is not text",
    (value) => {
      expect(validateOtherNames(value)).toEqual({
        isValid: false,
        message: "Other names must be text",
        code: "INVALID_TYPE",
      });
    },
  );

  it("refuses more than 500 characters, and accepts exactly 500", () => {
    const name = "x".repeat(60);
    const text = (length: number) => `${name}, `.repeat(10).slice(0, length);

    expect(validateOtherNames(text(500))).toEqual({ isValid: true });
    expect(validateOtherNames(`${text(500)}y`)).toEqual({
      isValid: false,
      message: "Other names must be at most 500 characters",
      code: "TOO_LONG",
    });
  });

  it("counts the length without the white space around the text", () => {
    expect(validateOtherNames(`  ${"x".repeat(80)}  `)).toEqual({ isValid: true });
    expect(validateOtherNames(`${" ".repeat(600)}Facebook`)).toEqual({ isValid: true });
  });

  it("refuses more than 8 names, and accepts exactly 8", () => {
    const names = (count: number) =>
      Array.from({ length: count }, (_, n) => `Name ${n}`).join(", ");

    expect(validateOtherNames(names(8))).toEqual({ isValid: true });
    expect(validateOtherNames(names(9))).toEqual({
      isValid: false,
      message: "Other names can list at most 8 names",
      code: "TOO_MANY",
    });
  });

  it("counts a name once however it is written", () => {
    expect(validateOtherNames("Facebook, FACEBOOK, face-book, Face Book")).toEqual({
      isValid: true,
    });
    const nine = "A1, B2, C3, D4, E5, F6, G7, H8, h8, I9";

    expect(validateOtherNames(nine)).toEqual({
      isValid: false,
      message: "Other names can list at most 8 names",
      code: "TOO_MANY",
    });
  });

  it("refuses a name of one character or of more than 80, and accepts 2 and 80", () => {
    const wrong = {
      isValid: false,
      message: "Each of the other names must be between 2 and 80 characters",
      code: "INVALID_NAME_LENGTH",
    };

    expect(validateOtherNames("Facebook, A")).toEqual(wrong);
    expect(validateOtherNames(`Facebook, ${"x".repeat(81)}`)).toEqual(wrong);
    expect(validateOtherNames(`3M, ${"y".repeat(80)}`)).toEqual({ isValid: true });
  });

  it("refuses a name with no letter or digit in it", () => {
    expect(validateOtherNames("Facebook, --")).toEqual({
      isValid: false,
      message: "Each of the other names must contain a letter or a digit",
      code: "INVALID_NAME",
    });
  });
});

describe("normalizeOtherNames", () => {
  it("is null for no text, an empty text or one with only separators", () => {
    for (const value of [undefined, null, "", "   ", " , ;\n"]) {
      expect(normalizeOtherNames(value)).toBeNull();
    }
  });

  it("keeps the names as the person wrote them, one separator and one white space between", () => {
    expect(normalizeOtherNames("  Facebook ,Instagram;  WhatsApp\nMeta   Quest  ")).toBe(
      "Facebook, Instagram, WhatsApp, Meta Quest",
    );
  });

  it("keeps a repeated name once, the first way it was written", () => {
    expect(normalizeOtherNames("Facebook, FACEBOOK, Instagram, face-book")).toBe(
      "Facebook, Instagram",
    );
  });

  it("is the same text when it is normalized again", () => {
    const once = normalizeOtherNames("  A1 ;B2,\nC3 ,a1");
    expect(normalizeOtherNames(once)).toBe(once);
  });
});

describe("the schemas of a vendor", () => {
  it("validate the other names on creation and on update, as an optional field", () => {
    expect(createVendorSchema.other_names("Facebook")).toEqual({ isValid: true });
    expect(createVendorSchema.other_names(undefined)).toEqual({ isValid: true });
    expect(createVendorSchema.other_names("x")).toMatchObject({ isValid: false });
    expect(updateVendorSchema.other_names(undefined)).toEqual({ isValid: true });
    expect(updateVendorSchema.other_names("x")).toMatchObject({ isValid: false });
  });

  it("count the other names as a field of an update: an update of only that field is an update", () => {
    expect(validateUpdateVendor({ other_names: "Facebook" })).toEqual([]);
    expect(validateUpdateVendor({ other_names: "" })).toEqual([]);
    expect(validateUpdateVendor({ other_names: "x" })).toMatchObject([
      { field: "other_names", code: "INVALID_NAME_LENGTH" },
    ]);
  });
});
