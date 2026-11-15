import {
  POLICY_ALL_FIELDS_SHARE_WARNING,
  POLICY_LIST_SHARE_WARNING,
  shareLinkWarnings,
} from "../shareLinkWarnings.utils";

describe("shareLinkWarnings", () => {
  it("warns that a policy list link shows every status", () => {
    expect(shareLinkWarnings("policy", 0, { shareAllFields: false })).toEqual([
      POLICY_LIST_SHARE_WARNING,
    ]);
  });

  it("warns that share all fields exposes full policy text, on a list or one policy", () => {
    expect(shareLinkWarnings("policy", 0, { shareAllFields: true })).toEqual([
      POLICY_LIST_SHARE_WARNING,
      POLICY_ALL_FIELDS_SHARE_WARNING,
    ]);
    expect(shareLinkWarnings("policy", 7, { shareAllFields: true })).toEqual([
      POLICY_ALL_FIELDS_SHARE_WARNING,
    ]);
  });

  it("has nothing to say about a single policy with essential fields only", () => {
    expect(shareLinkWarnings("policy", 7, { shareAllFields: false })).toEqual([]);
    expect(shareLinkWarnings("policy", 7, null)).toEqual([]);
  });

  it("treats only a true shareAllFields as on, as the shared view does", () => {
    expect(shareLinkWarnings("policy", 7, { shareAllFields: "true" })).toEqual([]);
  });

  it("leaves other resource types alone", () => {
    expect(shareLinkWarnings("model", 0, { shareAllFields: true })).toEqual([]);
  });
});
