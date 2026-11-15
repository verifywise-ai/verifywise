import { describe, expect, it } from "vitest";
import {
  POLICY_STATUSES,
  getSelectablePolicyStatuses,
  isPolicyStatusChangeAllowed,
} from "../policyStatusOptions";

/**
 * The full from → to matrix the server's getPolicyStatusChangeError allows
 * (Servers/utils/policyStatus.utils.ts, no pending request). A row lists the
 * statuses reachable by hand from that status.
 */
const ALLOWED_BY_HAND: Record<string, string[]> = {
  "Draft": ["Draft", "Archived", "Deprecated"],
  "Under Review": ["Draft", "Under Review", "Archived", "Deprecated"],
  "Approved": ["Draft", "Approved", "Published", "Archived", "Deprecated"],
  "Published": ["Published", "Archived", "Deprecated"],
  "Archived": ["Archived", "Deprecated"],
  "Deprecated": ["Draft", "Archived", "Deprecated"],
};

describe("isPolicyStatusChangeAllowed", () => {
  for (const from of POLICY_STATUSES) {
    for (const to of POLICY_STATUSES) {
      const expected = ALLOWED_BY_HAND[from].includes(to);
      it(`${from} → ${to} is ${expected ? "allowed" : "rejected"}`, () => {
        expect(isPolicyStatusChangeAllowed(from, to)).toBe(expected);
      });
    }
  }

  it("allows only draft, archived and deprecated on create", () => {
    expect(POLICY_STATUSES.filter((s) => isPolicyStatusChangeAllowed(null, s))).toEqual([
      "Draft",
      "Archived",
      "Deprecated",
    ]);
  });

  it("rejects every change while a request is pending but keeps the current value", () => {
    for (const to of POLICY_STATUSES) {
      expect(isPolicyStatusChangeAllowed("Under Review", to, true)).toBe(to === "Under Review");
    }
  });

  it("encodes each transition-table row", () => {
    // Rules 3–5 already cover the →Under Review, →Approved and Deprecated→Published rows.
    expect(isPolicyStatusChangeAllowed("Published", "Draft")).toBe(false);
    expect(isPolicyStatusChangeAllowed("Published", "Under Review")).toBe(false);
    expect(isPolicyStatusChangeAllowed("Archived", "Draft")).toBe(false);
    expect(isPolicyStatusChangeAllowed("Archived", "Under Review")).toBe(false);
    expect(isPolicyStatusChangeAllowed("Archived", "Approved")).toBe(false);
    expect(isPolicyStatusChangeAllowed("Deprecated", "Published")).toBe(false);
  });
});

describe("getSelectablePolicyStatuses", () => {
  it("offers draft, archived and deprecated for a new policy", () => {
    expect(getSelectablePolicyStatuses(null)).toEqual(["Draft", "Archived", "Deprecated"]);
  });

  it("offers published only from approved", () => {
    expect(getSelectablePolicyStatuses("Approved")).toEqual([
      "Draft",
      "Approved",
      "Published",
      "Archived",
      "Deprecated",
    ]);
    expect(getSelectablePolicyStatuses("Draft")).not.toContain("Published");
  });

  it("never offers under review or approved unless current", () => {
    expect(getSelectablePolicyStatuses("Draft")).toEqual(["Draft", "Archived", "Deprecated"]);
    expect(getSelectablePolicyStatuses("Under Review")).toContain("Under Review");
    expect(getSelectablePolicyStatuses("Under Review")).not.toContain("Approved");
  });

  it("keeps the current value in the list in every case", () => {
    for (const s of POLICY_STATUSES) {
      expect(getSelectablePolicyStatuses(s)).toContain(s);
      expect(getSelectablePolicyStatuses(s, true)).toEqual([s]);
    }
  });

  it("keeps a legacy status outside the enum as the first option", () => {
    expect(getSelectablePolicyStatuses("in review")).toEqual([
      "in review",
      "Draft",
      "Archived",
      "Deprecated",
    ]);
  });
});
