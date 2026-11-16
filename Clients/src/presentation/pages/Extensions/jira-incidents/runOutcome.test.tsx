import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describeJiraIncidentsRun } from "./runOutcome";

const run = (counts: Record<string, number>) => ({ counts });

const renderSummary = (node: ReactNode) => render(<p>{node}</p>).container.querySelector("p")!;

/** The rendered text nodes, trimmed, as the DOM translator sees them. */
const textNodes = (el: Element) =>
  Array.from(el.childNodes)
    .map((n) => n.textContent?.trim() ?? "")
    .filter(Boolean);

describe("describeJiraIncidentsRun", () => {
  it("lists non-zero counts in order", () => {
    const el = renderSummary(
      describeJiraIncidentsRun(run({ imported: 2, status_from_jira: 1, conflicts: 1, errors: 0 })),
    );
    expect(el.textContent).toBe("Sync completed: 2 imported, 1 status from Jira, 1 conflict");
  });

  it("says no changes", () => {
    expect(renderSummary(describeJiraIncidentsRun(run({}))).textContent).toBe(
      "Sync completed: no changes",
    );
  });

  it("pluralises", () => {
    const el = renderSummary(
      describeJiraIncidentsRun(run({ status_to_jira: 2, errors: 3, deleted_in_jira: 2 })),
    );
    expect(el.textContent).toBe("Sync completed: 2 statuses to Jira, 3 errors, 2 deleted in Jira");
  });

  it("keeps every count and word in its own text node so the words translate", () => {
    const el = renderSummary(describeJiraIncidentsRun(run({ imported: 2, conflicts: 1 })));
    expect(textNodes(el)).toEqual(["Sync completed:", "2", "imported", ",", "1", "conflict"]);
  });
});
