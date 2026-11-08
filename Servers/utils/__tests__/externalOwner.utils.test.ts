import { describe, expect, it } from "@jest/globals";
import {
  formatExternalOwnerName,
  resolveOwnerForCreate,
  resolveOwnerForUpdate,
} from "../externalOwner.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const userOwned = { owner: 7, external_owner_name: null, external_owner_email: null };
const externalOwned = {
  owner: null,
  external_owner_name: "Ada Lovelace",
  external_owner_email: "ada@example.com",
};

describe("resolveOwnerForCreate", () => {
  it("keeps a user owner and leaves the external fields empty", () => {
    expect(resolveOwnerForCreate({ owner: 7 })).toEqual({
      owner: 7,
      external_owner_name: null,
      external_owner_email: null,
    });
  });

  it("stores an external owner with no user owner and a lowercase, trimmed email", () => {
    expect(
      resolveOwnerForCreate({
        external_owner_name: "  Ada Lovelace ",
        external_owner_email: " Ada@Example.COM ",
      }),
    ).toEqual({
      owner: null,
      external_owner_name: "Ada Lovelace",
      external_owner_email: "ada@example.com",
    });
  });

  it("rejects a use case with neither kind of owner", () => {
    expect(() => resolveOwnerForCreate({})).toThrow(ValidationException);
    expect(() =>
      resolveOwnerForCreate({
        owner: null,
        external_owner_name: "",
        external_owner_email: "  ",
      }),
    ).toThrow(ValidationException);
  });

  it("rejects both kinds of owner at once", () => {
    expect(() =>
      resolveOwnerForCreate({
        owner: 7,
        external_owner_name: "Ada",
        external_owner_email: "ada@example.com",
      }),
    ).toThrow(ValidationException);
  });

  it("rejects an external owner missing the name or the email", () => {
    expect(() => resolveOwnerForCreate({ external_owner_name: "Ada" })).toThrow(
      ValidationException,
    );
    expect(() => resolveOwnerForCreate({ external_owner_email: "ada@example.com" })).toThrow(
      ValidationException,
    );
  });

  it("rejects a malformed email and an overlong name", () => {
    expect(() =>
      resolveOwnerForCreate({ external_owner_name: "Ada", external_owner_email: "not-an-email" }),
    ).toThrow(ValidationException);
    expect(() =>
      resolveOwnerForCreate({
        external_owner_name: "x".repeat(256),
        external_owner_email: "ada@example.com",
      }),
    ).toThrow(ValidationException);
  });

  it("rejects line breaks in the name", () => {
    expect(() =>
      resolveOwnerForCreate({
        external_owner_name: "Ada\r\nBcc: x@example.com",
        external_owner_email: "ada@example.com",
      }),
    ).toThrow(ValidationException);
  });

  it("rejects non-string external fields rather than storing them", () => {
    expect(() =>
      resolveOwnerForCreate({
        external_owner_name: 42 as unknown as string,
        external_owner_email: "ada@example.com",
      }),
    ).toThrow(ValidationException);
  });
});

describe("resolveOwnerForUpdate", () => {
  it("leaves ownership alone on a partial update that does not mention it", () => {
    expect(resolveOwnerForUpdate({}, userOwned)).toEqual({});
    expect(resolveOwnerForUpdate({}, externalOwned)).toEqual({});
  });

  it("clears the external owner when a user owner is selected", () => {
    expect(resolveOwnerForUpdate({ owner: 9 }, externalOwned)).toEqual({
      owner: 9,
      external_owner_name: null,
      external_owner_email: null,
    });
  });

  it("clears the user owner when an external owner is selected", () => {
    expect(
      resolveOwnerForUpdate(
        { external_owner_name: "Ada", external_owner_email: "ADA@example.com" },
        userOwned,
      ),
    ).toEqual({ owner: null, external_owner_name: "Ada", external_owner_email: "ada@example.com" });
  });

  it("replaces one external owner with another", () => {
    expect(
      resolveOwnerForUpdate(
        { owner: null, external_owner_name: "Bob", external_owner_email: "bob@example.com" },
        externalOwned,
      ),
    ).toEqual({ owner: null, external_owner_name: "Bob", external_owner_email: "bob@example.com" });
  });

  it("merges a change to only one external field with the stored one", () => {
    expect(resolveOwnerForUpdate({ external_owner_name: "Ada L." }, externalOwned)).toEqual({
      owner: null,
      external_owner_name: "Ada L.",
      external_owner_email: "ada@example.com",
    });
  });

  it("rejects both kinds of owner in one update", () => {
    expect(() =>
      resolveOwnerForUpdate(
        { owner: 9, external_owner_name: "Ada", external_owner_email: "ada@example.com" },
        userOwned,
      ),
    ).toThrow(ValidationException);
  });

  it("rejects clearing the only owner", () => {
    expect(() => resolveOwnerForUpdate({ owner: null }, userOwned)).toThrow(ValidationException);
    expect(() =>
      resolveOwnerForUpdate(
        { external_owner_name: null, external_owner_email: null },
        externalOwned,
      ),
    ).toThrow(ValidationException);
  });

  it("accepts a full payload that repeats owner: null on an externally owned use case", () => {
    expect(resolveOwnerForUpdate({ owner: null }, externalOwned)).toEqual({});
  });

  it("does not treat a user whose account was deleted as an external owner", () => {
    const orphaned = { owner: null, external_owner_name: null, external_owner_email: null };
    expect(resolveOwnerForUpdate({}, orphaned)).toEqual({});
    expect(() => resolveOwnerForUpdate({ owner: null }, orphaned)).toThrow(ValidationException);
  });

  it("lets an explicit clear of empty external fields pass on a user-owned use case", () => {
    expect(
      resolveOwnerForUpdate({ external_owner_name: null, external_owner_email: null }, userOwned),
    ).toEqual({ external_owner_name: null, external_owner_email: null });
  });
});

describe("formatExternalOwnerName", () => {
  it("marks the name as external", () => {
    expect(formatExternalOwnerName("Ada Lovelace")).toBe("Ada Lovelace (external)");
  });
});
