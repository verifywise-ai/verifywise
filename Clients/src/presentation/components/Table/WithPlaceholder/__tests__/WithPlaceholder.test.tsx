import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";
import type { VendorRisk } from "../../../../../domain/types/VendorRisk";

vi.mock("../../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({ data: [] }),
}));
vi.mock("../../../VendorRisksDialog", () => ({ default: () => null }));
vi.mock("../../../ViewRelationshipsButton", () => ({ default: () => null }));
vi.mock("../../../VendorLogo", () => ({
  default: ({ vendorName }: { vendorName: string }) => <span>{vendorName}</span>,
}));

import TableWithPlaceholder from "..";

const vendor = (id: number, name: string): VendorModel =>
  ({
    id,
    vendor_name: name,
    vendor_provides: "Models",
    vendor_contact_person: "Jane",
    review_status: "Not started",
    projects: [],
  }) as unknown as VendorModel;

const manyVendors = Array.from({ length: 12 }, (_, i) =>
  vendor(i + 1, `Vendor ${String(i + 1).padStart(2, "0")}`),
);

const renderTable = (
  vendors: VendorModel[],
  props: { vendorRisks?: VendorRisk[]; noMatchesMessage?: string } = {},
) =>
  renderWithProviders(
    <TableWithPlaceholder
      vendors={vendors}
      users={[]}
      onDelete={vi.fn()}
      onEdit={vi.fn()}
      {...props}
    />,
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("verifywise_vendors_rows_per_page", "5");
});

describe("vendor table", () => {
  it("goes back to a page with rows when the list shrinks", async () => {
    const { rerender } = renderTable(manyVendors);

    await userEvent.click(screen.getByRole("button", { name: "last page" }));
    expect(screen.getByText("Vendor 11")).toBeInTheDocument();

    // A search now leaves one vendor.
    rerender(
      <TableWithPlaceholder
        vendors={[manyVendors[0]]}
        users={[]}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    );

    expect(screen.getByText("Vendor 01")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 - 1 of 1/)).toBeInTheDocument();
  });

  it("counts each risk once although it arrives once per use case", () => {
    const risk = (risk_id: number, project_id: number) =>
      ({ risk_id, vendor_id: 1, project_id }) as unknown as VendorRisk;
    renderTable([vendor(1, "Acme")], {
      vendorRisks: [risk(1, 1), risk(1, 2), risk(1, 3), risk(2, 1)],
    });

    expect(screen.getByText("2 risks")).toBeInTheDocument();
  });

  it("says nothing matches when a filter hides every vendor", () => {
    renderTable([], { noMatchesMessage: "No vendors match your search or filters." });

    expect(screen.getByText("No vendors match your search or filters.")).toBeInTheDocument();
    expect(screen.queryByText(/No vendors registered yet/)).toBeNull();
  });

  it("shows the first-run empty state when there is nothing to filter", () => {
    renderTable([]);

    expect(screen.getByText(/No vendors registered yet/)).toBeInTheDocument();
  });
});
