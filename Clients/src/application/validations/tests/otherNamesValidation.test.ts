import { checkOtherNames } from "../otherNamesValidation";

const ACCEPTED = { accepted: true, message: "" };

describe("checkOtherNames", () => {
  it.each([[""], ["   "], [" , ; ,\n"]])("accepts %p: a vendor needs no other name", (value) => {
    expect(checkOtherNames(value)).toEqual(ACCEPTED);
  });

  it("accepts names separated by commas, semicolons and line breaks", () => {
    expect(checkOtherNames("Facebook, Instagram;  WhatsApp\nMeta Quest\r\nMessenger")).toEqual(
      ACCEPTED,
    );
  });

  it("accepts 500 characters in all and refuses one more", () => {
    const name = "x".repeat(60);
    const text = (length: number) => `${name}, `.repeat(10).slice(0, length);

    expect(checkOtherNames(text(500))).toEqual(ACCEPTED);
    expect(checkOtherNames(`${text(500)}y`)).toEqual({
      accepted: false,
      message: "Other names must be at most 500 characters",
    });
  });

  it("counts the length without the white space around the text", () => {
    expect(checkOtherNames(`${" ".repeat(600)}Facebook`)).toEqual(ACCEPTED);
  });

  it("accepts 8 names and refuses 9, counting a name once however it is written", () => {
    const names = (count: number) =>
      Array.from({ length: count }, (_, n) => `Name ${n}`).join(", ");

    expect(checkOtherNames(names(8))).toEqual(ACCEPTED);
    expect(checkOtherNames(names(9))).toEqual({
      accepted: false,
      message: "Other names can list at most 8 names",
    });
    expect(checkOtherNames("Facebook, FACEBOOK, face-book, Face Book")).toEqual(ACCEPTED);
  });

  it("refuses a name of one character or of more than 80, and accepts 2 and 80", () => {
    const wrong = {
      accepted: false,
      message: "Each of the other names must be between 2 and 80 characters",
    };

    expect(checkOtherNames("Facebook, A")).toEqual(wrong);
    expect(checkOtherNames(`Facebook, ${"x".repeat(81)}`)).toEqual(wrong);
    expect(checkOtherNames(`3M, ${"y".repeat(80)}`)).toEqual(ACCEPTED);
  });

  it("refuses a name with no letter or digit in it", () => {
    expect(checkOtherNames("Facebook, --")).toEqual({
      accepted: false,
      message: "Each of the other names must contain a letter or a digit",
    });
  });

  it("agrees with the server limits", () => {
    // 500 characters, 8 names, 2 to 80 characters in a name: see validateOtherNames in
    // Servers/utils/validations/vendorValidation.utils.ts.
    expect(checkOtherNames("ab, cd, ef, gh, ij, kl, mn, op")).toEqual(ACCEPTED);
    expect(checkOtherNames("ab, cd, ef, gh, ij, kl, mn, op, qr").accepted).toBe(false);
  });
});
