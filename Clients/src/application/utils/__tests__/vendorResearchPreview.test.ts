import { describe, it, expect } from "vitest";
import { defaultActionOwner, toAcceptBody } from "../vendorResearchPreview";
import type { VendorRiskFormDetails } from "../../../domain/interfaces/i.vendor";

describe("defaultActionOwner", () => {
  const users = [{ id: 4 }, { id: 9 }];

  it("is the vendor's assignee when that user belongs to the organization", () => {
    expect(defaultActionOwner(9, users, 4)).toBe(9);
  });

  it("is the person adding the risk when the vendor has no assignee", () => {
    expect(defaultActionOwner(null, users, 4)).toBe(4);
    expect(defaultActionOwner(undefined, users, 4)).toBe(4);
  });

  it("is the person adding the risk when the assignee is not a user of the organization", () => {
    // Nothing ties a vendor's assignee to the organization's users: a stale id must not be offered.
    expect(defaultActionOwner(77, users, 4)).toBe(4);
  });

  it("is the person adding the risk while the users have not loaded", () => {
    expect(defaultActionOwner(9, [], 4)).toBe(4);
  });

  it.each([0, -1, 1.5, Number.NaN])("does not take %s for an assignee", (assignee) => {
    expect(defaultActionOwner(assignee, [{ id: assignee }, ...users], 4)).toBe(4);
  });

  it("is nobody when there is no assignee to offer and no signed-in user", () => {
    expect(defaultActionOwner(null, users, null)).toBeNull();
    expect(defaultActionOwner(77, users, null)).toBeNull();
  });
});

describe("toAcceptBody", () => {
  const details: VendorRiskFormDetails = {
    vendor_id: 3,
    risk_description: "Customer data was exposed",
    impact_description: "Customers could be affected",
    action_owner: "9",
    action_plan: "Ask for the incident report",
    risk_severity: "Major",
    risk_level: "High risk",
    likelihood: "Almost certain",
    frameworks: [11, 12],
  };

  it("sends what the form saved, with the owner as a number and without the vendor", () => {
    expect(toAcceptBody(details)).toEqual({
      action_owner: 9,
      risk_description: "Customer data was exposed",
      impact_description: "Customers could be affected",
      action_plan: "Ask for the incident report",
      risk_severity: "Major",
      risk_level: "High risk",
      likelihood: "Almost certain",
      frameworks: [11, 12],
    });
    // The finding decides the vendor, so the form's is not sent.
    expect(toAcceptBody(details)).not.toHaveProperty("vendor_id");
  });

  it.each([
    ["no owner", undefined],
    ["an owner that is not a number", "someone"],
    ["a zero owner", "0"],
    ["a negative owner", "-4"],
    ["a fractional owner", "1.5"],
  ])("leaves the owner out for %s, so that the server's default applies", (_label, owner) => {
    const body = toAcceptBody({ ...details, action_owner: owner });

    expect(body).not.toHaveProperty("action_owner");
    expect(body.risk_description).toBe("Customer data was exposed");
  });
});
