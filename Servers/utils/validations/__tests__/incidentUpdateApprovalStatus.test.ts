import { validateIncidentUpdateBusinessRules } from "../incidentManagementValidation.utils";

describe("validateIncidentUpdateBusinessRules: approval_status", () => {
  it.each(["Approved", "Rejected", "Pending", "Not required"])("accepts %s", (value) => {
    expect(validateIncidentUpdateBusinessRules({ approval_status: value })).toEqual([]);
  });

  it.each([["Bogus"], ["approved"], [null], [""]])("rejects %p with a field error", (value) => {
    const errors = validateIncidentUpdateBusinessRules({ approval_status: value });
    expect(errors.map((e) => e.field)).toEqual(["approval_status"]);
  });

  it("ignores an update that does not send approval_status", () => {
    expect(validateIncidentUpdateBusinessRules({ status: "Open" })).toEqual([]);
  });
});
