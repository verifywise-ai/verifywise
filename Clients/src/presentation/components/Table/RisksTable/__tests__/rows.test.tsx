import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { VendorRisk } from "../../../../../domain/types/VendorRisk";
import type { User } from "../../../../../domain/types/User";

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({ data: [] }),
}));

import RiskTable from "..";

// GET /vendorRisks/all: one row per (vendor risk, use case).
const row = (id: number, description: string, extra: Record<string, unknown> = {}) =>
  ({
    risk_id: id,
    vendor_id: 1,
    risk_description: description,
    likelihood: "Possible",
    risk_severity: "Major",
    risk_level: "High risk",
    action_owner: 1,
    ...extra,
  }) as unknown as VendorRisk;

const users = [
  { id: 1, name: "Zoe", surname: "Young" },
  { id: 2, name: "Adam", surname: "Ames" },
] as User[];

const renderTable = (vendorRisks: VendorRisk[], noMatchesMessage?: string) =>
  renderWithProviders(
    <RiskTable
      users={users}
      vendors={[]}
      vendorRisks={vendorRisks}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      noMatchesMessage={noMatchesMessage}
    />,
  );

beforeEach(() => {
  localStorage.clear();
});

describe("vendor risks table rows", () => {
  it("shows a risk once whatever the number of use cases it arrives with", () => {
    renderTable([
      row(1, "Data leak", { project_title: "Lending" }),
      row(1, "Data leak", { project_title: "Onboarding" }),
      row(1, "Data leak", { project_title: "Fraud" }),
    ]);

    expect(screen.getAllByText("Data leak")).toHaveLength(1);
    expect(screen.getByText("Lending")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("says nothing matches when a filter hides every risk", () => {
    renderTable([], "No vendor risks match your search or filters.");

    expect(screen.getByText("No vendor risks match your search or filters.")).toBeInTheDocument();
    expect(screen.queryByText(/No risks identified yet/)).toBeNull();
  });

  it("shows the first-run empty state when there is nothing to filter", () => {
    renderTable([]);

    expect(screen.getByText(/No risks identified yet/)).toBeInTheDocument();
  });

  it("sorts the action owner by name, not by user id", async () => {
    renderTable([
      row(1, "Owned by Zoe", { action_owner: 1 }),
      row(2, "Owned by Adam", { action_owner: 2 }),
    ]);

    await userEvent.click(screen.getByText("action owner"));

    const descriptions = screen
      .getAllByRole("row")
      .map((r) => r.textContent ?? "")
      .filter((text) => text.includes("Owned by"));
    expect(descriptions[0]).toContain("Owned by Adam");
    expect(descriptions[1]).toContain("Owned by Zoe");
  });
});
