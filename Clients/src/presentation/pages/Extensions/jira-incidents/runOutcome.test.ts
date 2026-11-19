import { describe, expect, it } from "vitest";
import { describeJiraIncidentsRun } from "./runOutcome";

const run = (counts: Record<string, number>) => ({ counts });
const english = (key: string) => key;

describe("describeJiraIncidentsRun", () => {
  it("lists non-zero counts in order", () => {
    expect(
      describeJiraIncidentsRun(
        run({ imported: 2, status_from_jira: 1, conflicts: 1, errors: 0 }),
        english,
        "en",
      ),
    ).toBe("Sync completed: 2 incidents imported, 1 status from Jira, 1 conflict");
  });

  it("says no changes", () => {
    expect(describeJiraIncidentsRun(run({}), english, "en")).toBe("Sync completed: no changes");
  });

  it("pluralises", () => {
    expect(
      describeJiraIncidentsRun(
        run({ status_to_jira: 2, errors: 3, deleted_in_jira: 2 }),
        english,
        "en",
      ),
    ).toBe("Sync completed: 2 statuses to Jira, 3 errors, 2 issues deleted in Jira");
  });

  it("translates the summary and each count as whole templates", () => {
    const dictionary: Record<string, string> = {
      "Sync completed: {counts}": "Synchronisation terminée : {counts}",
      "{count} incident imported": "{count} incident importé",
      "{count} conflict": "{count} conflit",
    };
    const french = (key: string) => dictionary[key] ?? key;
    // French reads 0 and 1 as singular: the singular template is used for 1.
    expect(describeJiraIncidentsRun(run({ imported: 1, conflicts: 1 }), french, "fr")).toBe(
      "Synchronisation terminée : 1 incident importé, 1 conflit",
    );
  });
});
