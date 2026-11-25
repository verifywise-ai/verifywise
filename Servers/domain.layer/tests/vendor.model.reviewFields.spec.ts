/**
 * The review status and date of a vendor, as an update sets them. The database takes no empty
 * text for either (the status is an enum, the date a timestamp), so an empty one clears the field,
 * as null does, where it used to fail the update with a server error.
 *
 * This file tests the real VendorModel (vendor.model.spec.ts tests a copy of it). A
 * sequelize-typescript model cannot be constructed before it is added to a Sequelize instance, so
 * the decorators and the base class are stubbed, as there.
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

import { VendorModel } from "../models/vendor/vendor.model";

const REVIEW_DATE = new Date("2026-10-20T00:00:00.000Z");

/** A vendor with a review, as the controller reads it before an update. */
const reviewed = (): VendorModel =>
  new VendorModel({
    vendor_name: "Pellmark Analytics Ltd",
    vendor_provides: "Supply chain analytics",
    assignee: 2,
    website: "https://pellmarkanalytics.example",
    vendor_contact_person: "Jane Doe",
    review_status: "In review",
    review_date: REVIEW_DATE,
  });

/** An update as a request body carries it: a date as text, and a field left empty as "". */
const body = (fields: Record<string, unknown>) =>
  fields as Parameters<VendorModel["updateVendor"]>[0];

describe("VendorModel.updateVendor: the review status and date", () => {
  it.each([[""], [null]])("an empty value (%p) clears both", async (empty) => {
    const vendor = reviewed();

    await vendor.updateVendor(body({ review_status: empty, review_date: empty }));

    expect(vendor.review_status).toBeNull();
    expect(vendor.review_date).toBeNull();
  });

  it("keeps a status and a date that are given", async () => {
    const vendor = reviewed();

    await vendor.updateVendor(
      body({ review_status: "Reviewed", review_date: "2026-10-31T09:00:00.000Z" }),
    );

    expect(vendor.review_status).toBe("Reviewed");
    expect(vendor.review_date).toBe("2026-10-31T09:00:00.000Z");
  });

  it("leaves them as they are when the update does not name them", async () => {
    const vendor = reviewed();

    await vendor.updateVendor(body({ vendor_name: "Pellmark Analytics GmbH" }));

    expect(vendor.review_status).toBe("In review");
    expect(vendor.review_date).toBe(REVIEW_DATE);
  });
});
