/**
 * The text fields of a vendor given as something else than text (a number, a list, an object). The
 * model trimmed them, so such a request answered 500 with "vendor_name.trim is not a function"
 * where it should answer 400. Each now fails as a ValidationException that names the field.
 *
 * This file tests the real VendorModel, with the decorators and the base class stubbed (see
 * domain.layer/tests/vendor.model.reviewFields.spec.ts).
 */
import { describe, it, expect, jest } from "@jest/globals";

jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  DataType: {
    INTEGER: jest.fn(),
    STRING: jest.fn(),
    TEXT: jest.fn(),
    DATE: jest.fn(),
    BOOLEAN: jest.fn(),
    CHAR: jest.fn(),
    ENUM: jest.fn(),
  },
  ForeignKey: jest.fn(),
  Table: jest.fn(),
  Model: class MockModel {},
}));
jest.mock("../../user/user.model", () => ({ UserModel: class MockUserModel {} }));

import { VendorModel } from "../vendor.model";
import { ValidationException } from "../../../exceptions/custom.exception";

const VALID = {
  vendor_name: "Acme",
  vendor_provides: "Payroll software",
  website: "acme.example",
  vendor_contact_person: "Jo Doe",
  review_result: "Fine",
};

type TextField = keyof typeof VALID;

const MESSAGES: Record<TextField, string> = {
  vendor_name: "Vendor name must be text",
  vendor_provides: "Vendor provides must be text",
  website: "Website must be text",
  vendor_contact_person: "Vendor contact person must be text",
  review_result: "Review result must be text",
};

const create = (fields: Record<string, unknown>) => {
  const f = { ...VALID, ...fields } as any;
  return VendorModel.createNewVendor(
    f.vendor_name,
    f.vendor_provides,
    2,
    f.website,
    f.vendor_contact_person,
    f.review_result,
  );
};

const stored = (): VendorModel =>
  new VendorModel({ ...VALID, assignee: 2 } as unknown as Partial<VendorModel>);

/** The exception `run` throws; fails when it throws something else or nothing. */
const thrown = async (run: () => Promise<unknown>): Promise<ValidationException> => {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationException);
    return error as ValidationException;
  }
  throw new Error("nothing was thrown");
};

const WRONG_TYPES: Array<[string, unknown]> = [
  ["a number", 5],
  ["true", true],
  ["a list", ["Acme"]],
  ["an object", { name: "Acme" }],
];

const FIELDS = Object.keys(VALID) as TextField[];

describe("VendorModel.createNewVendor: a text field that is not text", () => {
  for (const field of FIELDS) {
    it.each(WRONG_TYPES)(`${field} given as %s is a ValidationException`, async (_label, value) => {
      const error = await thrown(() => create({ [field]: value }));
      expect(error.message).toBe(MESSAGES[field]);
      expect(error.metadata.field).toBe(field);
    });
  }

  it("still says a missing required text is required", async () => {
    expect((await thrown(() => create({ vendor_name: undefined }))).message).toBe(
      "Vendor name is required",
    );
    expect((await thrown(() => create({ website: "" }))).message).toBe("Website is required");
  });

  it("still reads 0 and false as empty: a required text is missing, the review result none", async () => {
    for (const empty of [0, false]) {
      expect((await thrown(() => create({ vendor_name: empty }))).message).toBe(
        "Vendor name is required",
      );
      expect((await create({ review_result: empty })).review_result).toBe("");
    }
  });

  it("creates a vendor from texts", async () => {
    const vendor = await create({ vendor_name: "  Acme  " });
    expect(vendor.vendor_name).toBe("Acme");
    expect(vendor.review_result).toBe("Fine");
  });
});

describe("VendorModel.updateVendor: a text field that is not text", () => {
  for (const field of FIELDS) {
    it.each(WRONG_TYPES)(`${field} given as %s is a ValidationException`, async (_label, value) => {
      const vendor = stored();
      const error = await thrown(() => vendor.updateVendor({ [field]: value } as any));
      expect(error.message).toBe(MESSAGES[field]);
      expect(error.metadata.field).toBe(field);
      expect(vendor[field]).toBe(VALID[field]);
    });
  }

  it("still clears the review result with an empty text or null", async () => {
    for (const empty of ["", null, 0, false]) {
      const vendor = stored();
      await vendor.updateVendor({ review_result: empty } as any);
      expect(vendor.review_result).toBe("");
    }
  });

  it.each([[null], [0], [false]])(
    "still says a required text given as %p is required",
    async (empty) => {
      const error = await thrown(() => stored().updateVendor({ vendor_name: empty } as any));
      expect(error.message).toBe("Vendor name is required");
    },
  );
});
