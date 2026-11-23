import { validateVendorContactPerson } from "../vendorValidation.utils";

describe("validateVendorContactPerson", () => {
  it.each([
    "José García",
    "Zoë Müller",
    "O'Brien",
    "O’Brien",
    "Anne-Marie",
    "J. Smith",
    "Ngô Bảo Châu",
    "Łukasz",
  ])("accepts %s", (name) => {
    expect(validateVendorContactPerson(name).isValid).toBe(true);
  });

  it.each(["John_Doe", "John Doe123", "-Anne", "'Brien", "Jane <b>", "a@b.co"])(
    "rejects %s",
    (name) => {
      expect(validateVendorContactPerson(name).isValid).toBe(false);
    },
  );
});
