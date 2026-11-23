import { describe, it, expect } from "@jest/globals";
import "../../../../database/db";
import { VendorModel } from "../vendor.model";
import { vendorColumnValue } from "../../../../utils/vendor.utils";

const create = (reviewDate: unknown) =>
  VendorModel.createNewVendor(
    "Acme",
    "Hosting",
    1,
    "https://acme.test",
    "Jo",
    undefined,
    undefined,
    undefined,
    reviewDate as Date | undefined,
  );

describe("vendor review date", () => {
  // Decision 10: a new vendor has no review date unless one is picked.
  it.each([undefined, null, ""])(
    "leaves the review date unset on create when sent %p",
    async (sent) => {
      const vendor = await create(sent);
      expect(vendor.review_date).toBeUndefined();
    },
  );

  it("keeps a picked review date on create", async () => {
    const picked = "2026-12-01T12:00:00.000Z";
    const vendor = await create(picked);
    expect(new Date(vendor.review_date as Date).toISOString()).toBe(picked);
  });

  // createNewVendorQuery and updateVendorByIdQuery write review_date through
  // vendorColumnValue: '' and null both store NULL, so a cleared date clears.
  it.each(["", null])("stores %p as NULL", (sent) => {
    expect(vendorColumnValue("review_date", sent)).toBeNull();
  });

  it("stores a picked date as sent", () => {
    expect(vendorColumnValue("review_date", "2026-12-01T12:00:00.000Z")).toBe(
      "2026-12-01T12:00:00.000Z",
    );
  });
});
