import { describe, expect, it } from "vitest";
import {
  EXTERNAL_OWNER_OPTION_ID,
  externalOwnerLabel,
  externalOwnerPayload,
  ownerFilterValue,
  ownerSelectValue,
  validateExternalOwner,
} from "../externalOwner";

describe("ownerSelectValue", () => {
  it("returns the user id for a user owner", () => {
    expect(ownerSelectValue({ owner: 7 })).toBe(7);
  });

  it("returns the external option for an external owner", () => {
    expect(ownerSelectValue({ owner: null, external_owner_email: "ada@example.com" })).toBe(
      EXTERNAL_OWNER_OPTION_ID,
    );
  });

  it("returns 0 when neither is set", () => {
    expect(ownerSelectValue({ owner: null })).toBe(0);
    expect(ownerSelectValue({})).toBe(0);
  });
});

describe("externalOwnerPayload", () => {
  it("sends no user owner and trimmed external fields for the external option", () => {
    expect(externalOwnerPayload(EXTERNAL_OWNER_OPTION_ID, " Ada ", " ada@example.com ")).toEqual({
      owner: null,
      external_owner_name: "Ada",
      external_owner_email: "ada@example.com",
    });
  });

  it("sends the user owner and clears the external fields otherwise", () => {
    expect(externalOwnerPayload(7, "Ada", "ada@example.com")).toEqual({
      owner: 7,
      external_owner_name: null,
      external_owner_email: null,
    });
  });
});

describe("validateExternalOwner", () => {
  it("accepts a name and a valid email", () => {
    expect(validateExternalOwner("Ada", "ada@example.com")).toEqual({});
  });

  it("requires both fields", () => {
    expect(validateExternalOwner("  ", "")).toEqual({
      name: "Name is required",
      email: "Email is required",
    });
  });

  it("rejects a malformed email", () => {
    expect(validateExternalOwner("Ada", "not-an-email").email).toBe("Enter a valid email address");
  });

  it("bounds the lengths", () => {
    expect(validateExternalOwner("x".repeat(256), "ada@example.com").name).toBe(
      "Name must be at most 255 characters",
    );
    expect(validateExternalOwner("Ada", `${"x".repeat(250)}@example.com`).email).toBe(
      "Email must be at most 254 characters",
    );
  });
});

describe("ownerFilterValue", () => {
  it("is a stable key for either kind of owner", () => {
    expect(ownerFilterValue({ owner: 7 })).toBe("7");
    expect(ownerFilterValue({ owner: null, external_owner_email: "ada@example.com" })).toBe(
      "external:ada@example.com",
    );
    expect(ownerFilterValue({ owner: null })).toBeUndefined();
  });
});

describe("externalOwnerLabel", () => {
  it("marks the name as external", () => {
    expect(externalOwnerLabel("Ada")).toBe("Ada (external)");
  });
});
