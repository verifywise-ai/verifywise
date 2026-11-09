import { summarizeRun } from "../jiraIncidents.sync";
import { newCounts } from "../jiraIncidents.run";

describe("summarizeRun", () => {
  it("lists only non-zero counts", () => {
    expect(summarizeRun({ ...newCounts(), imported: 2, conflicts: 1 }, null)).toBe(
      "Imported 2, 1 conflict.",
    );
  });
  it("uses the full order and plurals", () => {
    expect(
      summarizeRun(
        {
          imported: 1,
          status_from_jira: 2,
          status_to_jira: 1,
          conflicts: 2,
          errors: 1,
          deleted_in_jira: 3,
        },
        null,
      ),
    ).toBe(
      "Imported 1, 2 statuses from Jira, 1 status to Jira, 2 conflicts, 1 error, 3 deleted in Jira.",
    );
  });
  it("says no changes", () => {
    expect(summarizeRun(newCounts(), null)).toBe("No changes.");
  });
  it("appends the stop reason", () => {
    expect(
      summarizeRun(
        { ...newCounts(), errors: 2 },
        "Rate limited by Jira. The next sync continues where this one stopped.",
      ),
    ).toBe("2 errors. Rate limited by Jira. The next sync continues where this one stopped.");
  });
});
