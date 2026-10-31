/**
 * The values of a vendor that the database would refuse: a review status or a scorecard answer
 * outside its list (each is an enum column) and a review date that is not a date (a timestamp
 * column). The model refuses them with a ValidationException, which the API answers 400 and which
 * names the field and the values it takes, where the database used to refuse them with an error
 * the API answered 500. An empty answer or null is no answer: it clears a scorecard answer on an
 * update, as it does the review status and date (vendor.model.reviewFields.spec.ts).
 *
 * The real VendorModel, with sequelize-typescript stubbed as in vendor.model.reviewFields.spec.ts.
 */
jest.mock("sequelize-typescript", () => ({
  Column: jest.fn(),
  // Each type is a function, since the model uses some as values and some as calls (STRING(64)).
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
jest.mock("../models/user/user.model", () => ({ UserModel: class MockUserModel {} }));

import { ValidationException } from "../exceptions/custom.exception";
import { VendorModel } from "../models/vendor/vendor.model";
import {
  VENDOR_BUSINESS_CRITICALITY_ENUM,
  VENDOR_DATA_SENSITIVITY_ENUM,
  VENDOR_PAST_ISSUES_ENUM,
  VENDOR_REGULATORY_EXPOSURE_ENUM,
  VENDOR_REVIEW_STATUS_ENUM,
} from "../../utils/validations/vendorValidation.utils";

/** Each field with a closed list: its name in messages, its values and a value outside them. */
const LISTS = [
  ["review_status", "Review status", VENDOR_REVIEW_STATUS_ENUM, "Done"],
  ["data_sensitivity", "Data sensitivity", VENDOR_DATA_SENSITIVITY_ENUM, "Secret"],
  ["business_criticality", "Business criticality", VENDOR_BUSINESS_CRITICALITY_ENUM, "Critical"],
  ["past_issues", "Past issues", VENDOR_PAST_ISSUES_ENUM, 3],
  ["regulatory_exposure", "Regulatory exposure", VENDOR_REGULATORY_EXPOSURE_ENUM, "PCI DSS"],
] as const;

const SCORECARD = [
  "data_sensitivity",
  "business_criticality",
  "past_issues",
  "regulatory_exposure",
] as const;

/** A vendor with a review and its scorecard answered, as the controller reads it before an update. */
const answered = (): VendorModel =>
  new VendorModel({
    vendor_name: "Pellmark Analytics Ltd",
    vendor_provides: "Supply chain analytics",
    assignee: 2,
    website: "https://pellmarkanalytics.example",
    vendor_contact_person: "Jane Doe",
    review_status: "In review",
    review_date: new Date("2026-10-20T00:00:00.000Z"),
    data_sensitivity: "Financial data",
    business_criticality: "High (critical to core services or products)",
    past_issues: "None",
    regulatory_exposure: "GDPR (EU)",
  });

/** An update as a request body carries it. */
const body = (fields: Record<string, unknown>) =>
  fields as Parameters<VendorModel["updateVendor"]>[0];

/** A vendor created through the model with these review and scorecard values. */
const create = (values: Record<string, unknown>) =>
  VendorModel.createNewVendor(
    "Pellmark Analytics Ltd",
    "Supply chain analytics",
    2,
    "https://pellmarkanalytics.example",
    "Jane Doe",
    undefined,
    values.review_status as never,
    undefined,
    values.review_date as never,
    undefined,
    false,
    [1],
    values.data_sensitivity as never,
    values.business_criticality as never,
    values.past_issues as never,
    values.regulatory_exposure as never,
  );

/** The refusal the API answers 400: the field, and a message that lists the values it takes. */
const refusal = (field: string, name: string, values: readonly string[]) => ({
  statusCode: 400,
  metadata: expect.objectContaining({ field }),
  message: `${name} must be one of: ${values.join(", ")}`,
  i18nKey: `${name} must be one of: {options}`,
  i18nVars: { options: values.join(", ") },
});

describe("VendorModel: a value the database would refuse", () => {
  it("says which values a review status takes", async () => {
    await expect(answered().updateVendor(body({ review_status: "Done" }))).rejects.toThrow(
      "Review status must be one of: Not started, In review, Reviewed, Requires follow-up",
    );
  });

  it.each(LISTS)("an update refuses %s outside its list", async (field, name, values, outside) => {
    const update = answered().updateVendor(body({ [field]: outside }));

    await expect(update).rejects.toBeInstanceOf(ValidationException);
    await expect(update).rejects.toMatchObject(refusal(field, name, values));
  });

  it.each(LISTS)("a create refuses %s outside its list", async (field, name, values, outside) => {
    const created = create({ [field]: outside });

    await expect(created).rejects.toBeInstanceOf(ValidationException);
    await expect(created).rejects.toMatchObject(refusal(field, name, values));
  });

  // The dates a write could not store: what `new Date()` cannot read either.
  it.each([["not a date"], ["2026-13-45"], [{}]])(
    "refuses the review date %p, on an update and on a create",
    async (date) => {
      const refused = {
        statusCode: 400,
        metadata: expect.objectContaining({ field: "review_date" }),
        message: "Review date must be a valid date",
      };

      await expect(answered().updateVendor(body({ review_date: date }))).rejects.toMatchObject(
        refused,
      );
      await expect(create({ review_date: date })).rejects.toMatchObject(refused);
    },
  );

  // A write stores milliseconds as a date, so they stay accepted.
  it.each([["2026-10-31T09:00:00.000Z"], [1793444806134]])(
    "takes the review date %p, on an update and on a create",
    async (date) => {
      const vendor = answered();

      await vendor.updateVendor(body({ review_date: date }));

      expect(vendor.review_date).toBe(date);
      await expect(create({ review_date: date })).resolves.toMatchObject({ review_date: date });
    },
  );

  it("takes every value of every list, on an update and on a create", async () => {
    for (const [field, , values] of LISTS) {
      for (const value of values) {
        const vendor = answered();
        await vendor.updateVendor(body({ [field]: value }));
        expect(vendor[field]).toBe(value);
        await expect(create({ [field]: value })).resolves.toMatchObject({ [field]: value });
      }
    }
  });

  it.each([[""], [null]])(
    "an empty scorecard answer (%p) clears it on an update",
    async (empty) => {
      const vendor = answered();

      await vendor.updateVendor(body(Object.fromEntries(SCORECARD.map((field) => [field, empty]))));

      for (const field of SCORECARD) expect(vendor[field]).toBeNull();
    },
  );

  it("a create gives the database no empty scorecard answer", async () => {
    const vendor = await create(Object.fromEntries(SCORECARD.map((field) => [field, ""])));

    for (const field of SCORECARD) expect(vendor[field] ?? null).toBeNull();
  });
});
