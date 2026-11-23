// The change history of a vendor compares the stored value of a field with the one a request sends.
// The model stores the other names in their normalised form (normalizeOtherNames), so the history
// has to be given that form too: otherwise a request that leaves the row as it is records a change,
// and the history shows a text the vendor never had.
jest.mock("../../database/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../auditLedger.utils", () => ({ appendToAuditLedger: jest.fn() }));

import { trackEntityChanges } from "../changeHistory.base.utils";
import { withNormalizedIdentifiers } from "../validations/vendorValidation.utils";

const STORED = { other_names: "Example, EX" };

describe("the other names in the change history of a vendor", () => {
  it.each([
    ["Example,EX"],
    ["Example; EX"],
    ["Example\nEX"],
    ["Example, EX, example"],
    ["  Example ,  EX  "],
  ])("records no change for %p, which is stored as the text already stored", async (sent) => {
    const changes = await trackEntityChanges(
      "vendor",
      STORED,
      withNormalizedIdentifiers({ other_names: sent }),
    );

    expect(changes).toEqual([]);
  });

  it("records the stored form of a real change", async () => {
    const changes = await trackEntityChanges(
      "vendor",
      STORED,
      withNormalizedIdentifiers({ other_names: "Example;Sample;example" }),
    );

    expect(changes).toEqual([
      { fieldName: "Other names", oldValue: "Example, EX", newValue: "Example, Sample" },
    ]);
  });

  it("records no change for a blank text when no other names are stored", async () => {
    const changes = await trackEntityChanges(
      "vendor",
      { other_names: null },
      withNormalizedIdentifiers({ other_names: "  ; " }),
    );

    expect(changes).toEqual([]);
  });

  it("gives the creation the stored form, and leaves the field out when it was not sent", () => {
    expect(withNormalizedIdentifiers({ other_names: "Acme; Acme;Initrode" })).toEqual({
      other_names: "Acme, Initrode",
    });
    expect(withNormalizedIdentifiers({ vendor_name: "Acme" })).toStrictEqual({
      vendor_name: "Acme",
    });
  });
});
