import { describe, expect, it } from "@jest/globals";
import {
  buildPolicyReplacements,
  buildPolicyUpdateReplacements,
} from "../automation/policy.automation.utils";

// Policy reads return the review date as UTC midnight (P-M1); emails must show
// that calendar day whatever the server's time zone (run with TZ=America/...).
describe("policy automation review date", () => {
  it("formats the stored day for policy_added", () => {
    const replacements = buildPolicyReplacements({
      next_review_date: "2030-01-15T00:00:00.000Z",
    } as never);
    expect(replacements["policy.next_review_date"]).toBe("January 15, 2030");
  });

  it("formats old and new days for policy_updated", () => {
    const replacements = buildPolicyUpdateReplacements(
      { next_review_date: "2030-01-15T00:00:00.000Z" } as never,
      { next_review_date: "2030-02-01T00:00:00.000Z" } as never,
    );
    expect(replacements["old_policy.next_review_date"]).toBe("January 15, 2030");
    expect(replacements["policy.next_review_date"]).toBe("February 1, 2030");
  });
});
