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
    "علی\u200Cرضا",
    "Gal·la",
  ])("accepts %s", (name) => {
    expect(validateVendorContactPerson(name).isValid).toBe(true);
  });

  it.each([
    "John_Doe",
    "John Doe123",
    "-Anne",
    "'Brien",
    "Jane <b>",
    "a@b.co",
    "Jane\nDoe",
    "Jane\tDoe",
  ])("rejects %s", (name) => {
    expect(validateVendorContactPerson(name).isValid).toBe(false);
  });
});
