import { isTableViewLink, shareLinkWarnings } from "../shareLinkWarnings.utils";

const policy = (
  resourceId: number,
  settings: Record<string, unknown> | null,
  extra: Record<string, unknown> = {},
) => ({ resource_type: "policy", resource_id: resourceId, settings, ...extra });

describe("shareLinkWarnings", () => {
  it("warns that a policy list link shows every status, and that export is on by default", () => {
    expect(shareLinkWarnings(policy(0, { shareAllFields: false }))).toEqual([
      "policyList",
      "policyExport",
    ]);
  });

  it("warns that share all fields shows every column, on a list or one policy", () => {
    expect(shareLinkWarnings(policy(0, { shareAllFields: true, allowDataExport: false }))).toEqual([
      "policyList",
      "policyAllFields",
    ]);
    expect(shareLinkWarnings(policy(7, { shareAllFields: true, allowDataExport: false }))).toEqual([
      "policyAllFields",
    ]);
  });

  it("has nothing to say about one policy with essential fields and no export", () => {
    expect(shareLinkWarnings(policy(7, { shareAllFields: false, allowDataExport: false }))).toEqual(
      [],
    );
  });

  it("treats only a true shareAllFields as on, as the shared view does", () => {
    expect(
      shareLinkWarnings(policy(7, { shareAllFields: "true", allowDataExport: false })),
    ).toEqual([]);
  });

  it("says nothing for a disabled or expired link, which shows nothing", () => {
    expect(shareLinkWarnings(policy(0, { shareAllFields: true }, { is_enabled: false }))).toEqual(
      [],
    );
    expect(
      shareLinkWarnings(
        policy(0, { shareAllFields: true }, { expires_at: "2000-01-01T00:00:00Z" }),
      ),
    ).toEqual([]);
  });

  it("leaves other resource types alone", () => {
    expect(
      shareLinkWarnings({
        resource_type: "model",
        resource_id: 0,
        settings: { shareAllFields: true },
      }),
    ).toEqual([]);
  });
});

describe("isTableViewLink", () => {
  it("is the list for resource id 0 only", () => {
    expect(isTableViewLink(0)).toBe(true);
    expect(isTableViewLink(3)).toBe(false);
  });
});
