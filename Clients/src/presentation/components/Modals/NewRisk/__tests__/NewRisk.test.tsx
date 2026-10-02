import { vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../AddNewRiskForm", () => ({
  default: () => <div data-testid="risk-form" />,
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../LinkedRisksPanel/VendorRiskLinksPanel", () => ({
  default: ({ vendorRiskId }: { vendorRiskId: number }) => (
    <div data-testid="vendor-risk-links">{vendorRiskId}</div>
  ),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewRisk from "../index";
import { ExistingRisk } from "../../../../../domain/interfaces/i.vendor";

const existingRisk: ExistingRisk = {
  id: 7,
  risk_description: "Vendor outage",
  impact_description: "Loans stop",
  impact: "Major",
  action_owner: "1",
  risk_severity: "Major",
  likelihood: "Possible",
  risk_level: "High",
  action_plan: "Second provider",
  vendor_id: "3",
  frameworks: [],
};

describe("NewRisk (AddNewRisk)", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} />);
    expect(document.body).toBeTruthy();
  });

  // Links attach to a saved vendor risk, so a new one has nothing to show.
  it("has no Linked risks tab while the risk is being created", () => {
    renderWithProviders(<AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} />);
    expect(screen.queryByRole("tab", { name: /linked risks/i })).toBeNull();
  });

  it("shows the vendor risk's links on the Linked risks tab, without a Save button", async () => {
    renderWithProviders(
      <AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} existingRisk={existingRisk} />,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /linked risks/i }));

    expect(await screen.findByTestId("vendor-risk-links")).toHaveTextContent("7");
    // Links save on their own; a Save here would quietly re-save the details tab.
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  // The table's "Inherited by" count opens the risk straight on its links.
  it("opens on the Linked risks tab when asked to", async () => {
    renderWithProviders(
      <AddNewRisk
        isOpen={true}
        setIsOpen={vi.fn()}
        vendors={[]}
        existingRisk={existingRisk}
        initialTab="linked-risks"
      />,
    );

    expect(await screen.findByTestId("vendor-risk-links")).toHaveTextContent("7");
    expect(screen.getByRole("tab", { name: /linked risks/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // A new risk has no links yet, so the tab request falls back to the form.
  it("ignores the Linked risks tab request for a risk being created", () => {
    renderWithProviders(
      <AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} initialTab="linked-risks" />,
    );

    expect(screen.queryByTestId("vendor-risk-links")).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
