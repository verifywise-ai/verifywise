import { describe, it, expect, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReportTable, { compareSortValues, type ReportColumn } from "../ReportTable";
import { riskLevelRank } from "../ControlCoverage";

interface Row {
  id: number;
  name: string;
  score: number | null;
}

const columns: ReportColumn<Row>[] = [
  { id: "name", label: "Name", sortable: true, sortValue: (r) => r.name, render: (r) => r.name },
  {
    id: "score",
    label: "Score",
    sortable: true,
    sortValue: (r) => r.score,
    render: (r) => r.score ?? "—",
  },
];

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Risk ${String(i + 1).padStart(2, "0")}`,
    score: i + 1,
  }));

const bodyNames = () =>
  screen
    .getAllByRole("row")
    .map((row) => within(row).queryByText(/^Risk \d+$/)?.textContent)
    .filter(Boolean);

const renderTable = (data: Row[]) =>
  renderWithProviders(
    <ReportTable
      columns={columns}
      rows={data}
      getRowKey={(r) => r.id}
      storageKey="report-table-test"
      defaultSortColumn="score"
      entityLabel="risk"
    />,
  );

describe("compareSortValues", () => {
  it("compares strings case-insensitively and numbers numerically", () => {
    expect(compareSortValues("apple", "Banana")).toBeLessThan(0);
    expect(compareSortValues(2, 10)).toBeLessThan(0);
  });

  it("puts nulls last", () => {
    expect(compareSortValues(null, 1)).toBeGreaterThan(0);
    expect(compareSortValues(1, null)).toBeLessThan(0);
    expect(compareSortValues(null, null)).toBe(0);
  });
});

describe("riskLevelRank", () => {
  it("orders levels by severity, not alphabetically", () => {
    expect(riskLevelRank("Very high risk")!).toBeGreaterThan(riskLevelRank("High risk")!);
    expect(riskLevelRank("High risk")!).toBeGreaterThan(riskLevelRank("Medium risk")!);
    expect(riskLevelRank("Low risk")!).toBeGreaterThan(riskLevelRank("No risk")!);
    expect(riskLevelRank(null)).toBeNull();
  });
});

describe("ReportTable", () => {
  beforeEach(() => localStorage.clear());

  it("shows one page of ten rows with the standard pagination footer", () => {
    renderTable(rows(12));
    expect(bodyNames()).toHaveLength(10);
    expect(screen.getByText("Showing 1 - 10 of 12 risks")).toBeInTheDocument();
  });

  it("sorts by the default column descending, then ascending on header click", async () => {
    renderTable(rows(3));
    expect(bodyNames()).toEqual(["Risk 03", "Risk 02", "Risk 01"]);

    await userEvent.click(screen.getByText("Name"));
    expect(bodyNames()).toEqual(["Risk 01", "Risk 02", "Risk 03"]);
  });

  it("moves to the next page", async () => {
    renderTable(rows(12));
    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(bodyNames()).toEqual(["Risk 02", "Risk 01"]);
  });
});
