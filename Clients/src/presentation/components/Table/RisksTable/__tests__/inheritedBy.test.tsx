import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { VendorRisk } from "../../../../../domain/types/VendorRisk";
import type { VendorRiskExposure } from "../../../../../domain/interfaces/i.riskLink";

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({ data: [] }),
}));

import RiskTable from "..";

const risk = (id: number, description: string): VendorRisk =>
  ({
    risk_id: id,
    vendor_id: 1,
    risk_description: description,
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High",
    action_owner: 1,
  }) as VendorRisk;

const reach = (overrides: Partial<VendorRiskExposure> & { vendor_risk_id: number }) => ({
  children: 0,
  suggested: 0,
  use_cases: [],
  ...overrides,
});

const risks = [
  risk(1, "Shared reach"),
  risk(2, "One child"),
  risk(3, "Only suggested"),
  risk(4, "Alone"),
];

const exposure = new Map<number, VendorRiskExposure>([
  [
    1,
    reach({
      vendor_risk_id: 1,
      children: 3,
      use_cases: [
        { id: 5, name: "Lending" },
        { id: 6, name: "Onboarding" },
      ],
    }),
  ],
  [2, reach({ vendor_risk_id: 2, children: 1 })],
  [3, reach({ vendor_risk_id: 3, suggested: 2 })],
]);

const rowOf = (description: string) => screen.getByText(description).closest("tr")!;

const renderTable = (props: Partial<Parameters<typeof RiskTable>[0]> = {}) => {
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onOpenLinks: vi.fn() };
  renderWithProviders(
    <RiskTable
      users={[]}
      vendors={[]}
      vendorRisks={risks}
      exposure={exposure}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

beforeEach(() => {
  localStorage.clear();
});

describe("vendor risks table, Inherited by column", () => {
  it("counts confirmed children, falls back to open suggestions, and dashes the rest", () => {
    renderTable();

    expect(within(rowOf("Shared reach")).getByText("3 project risks")).toBeInTheDocument();
    expect(within(rowOf("One child")).getByText("1 project risk")).toBeInTheDocument();
    expect(within(rowOf("Only suggested")).getByText("2 suggested")).toBeInTheDocument();
    expect(within(rowOf("Alone")).getAllByText("-").length).toBeGreaterThan(0);
  });

  it("opens the risk on its Linked risks tab, and nothing else on the row", async () => {
    const { onOpenLinks, onEdit } = renderTable();

    await userEvent.click(screen.getByText("3 project risks"));

    expect(onOpenLinks).toHaveBeenCalledWith(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("names the affected use cases on hover", async () => {
    renderTable();

    await userEvent.hover(screen.getByText("3 project risks"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent("Lending, Onboarding");
  });

  it("falls back to editing the risk when no Linked risks handler is given", async () => {
    const { onEdit } = renderTable({ onOpenLinks: undefined });

    await userEvent.click(screen.getByText("1 project risk"));

    expect(onEdit).toHaveBeenCalledWith(2);
  });

  it("dashes every row while the exposure report has not loaded", () => {
    renderTable({ exposure: undefined });

    expect(screen.queryByText(/project risks?$/)).not.toBeInTheDocument();
  });

  it("sorts by the number of confirmed children, both ways", async () => {
    renderTable();
    const order = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map(
          (row) =>
            within(row).queryByText(/^(Shared reach|One child|Only suggested|Alone)$/)?.textContent,
        )
        .filter(Boolean);

    await userEvent.click(screen.getByText("inherited by"));
    const ascending = order();
    await userEvent.click(screen.getByText("inherited by"));
    const descending = order();

    // The two rows with no children tie, so only their place is fixed.
    expect(ascending.slice(2)).toEqual(["One child", "Shared reach"]);
    expect(descending.slice(0, 2)).toEqual(["Shared reach", "One child"]);
  });

  it("is hidden when the column is switched off", () => {
    renderTable({ visibleColumns: new Set(["risk_description", "vendor_name"]) });

    expect(screen.queryByText("inherited by")).not.toBeInTheDocument();
    expect(screen.queryByText("3 project risks")).not.toBeInTheDocument();
  });
});
