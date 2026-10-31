import { describe, expect, it } from "vitest";
import { describeJiraIncidentsRun } from "./runOutcome";

const run = (counts: Record<string, number>) => ({ counts });

describe("describeJiraIncidentsRun", () => {
  it("lists non-zero counts in order", () => {
    expect(
      describeJiraIncidentsRun(run({ imported: 2, status_from_jira: 1, conflicts: 1, errors: 0 })),
    ).toBe("Sync completed: imported 2, 1 status from Jira, 1 conflict");
  });

  it("says no changes", () => {
    expect(describeJiraIncidentsRun(run({}))).toBe("Sync completed: no changes");
  });

  it("pluralises", () => {
    expect(
      describeJiraIncidentsRun(run({ status_to_jira: 2, errors: 3, deleted_in_jira: 2 })),
    ).toBe("Sync completed: 2 statuses to Jira, 3 errors, 2 deleted in Jira");
  });
});
