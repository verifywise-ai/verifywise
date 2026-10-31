import { vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The save handler of the form is the mutation it calls; these stand in for the requests.
const { createMutateAsync, updateMutateAsync } = vi.hoisted(() => ({
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
}));

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
vi.mock("../../../../../application/hooks/useVendorRiskMutations", () => ({
  useCreateVendorRisk: () => ({ mutateAsync: createMutateAsync }),
  useUpdateVendorRisk: () => ({ mutateAsync: updateMutateAsync }),
}));
// Only an Admin or an Editor may edit a vendor risk; the test store has no signed-in user.
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    token: "test-token",
    userToken: null,
    userRoleName: "Admin",
    userId: 1,
    organizationId: 1,
    isAuthenticated: true,
    isSuperAdmin: false,
  }),
}));
vi.mock("../../../CustomFieldsSection/RequiredCustomFieldsGate", () => ({
  useRequiredCustomFieldsGate: () => ({ blocked: false, onPendingChange: vi.fn() }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AddNewRisk from "../index";
import { ExistingRisk } from "../../../../../domain/interfaces/i.vendor";
import type { VendorModel } from "../../../../../domain/models/Common/vendor/vendor.model";
import { RiskCalculator } from "../../../../tools/riskCalculator";

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

  // Who and what first, then impact before the plan, then where it applies.
  it("lays the details out in reading order, with frameworks as an optional field", () => {
    renderWithProviders(<AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} />);

    const labels = [
      "Vendor",
      "Action owner",
      "Risk description",
      "Impact description",
      "Action plan",
      "Applicable frameworks",
      "Likelihood",
      "Risk severity",
    ].map((label) => screen.getAllByText(label)[0]);
    for (let i = 1; i < labels.length; i++) {
      expect(
        labels[i - 1].compareDocumentPosition(labels[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(
      screen.getByText("Select the compliance frameworks this vendor risk applies to."),
    ).toBeInTheDocument();
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

  // Regression guard: risk_level must be derived from the selected likelihood/severity
  // (the deleted AddNewVendorRiskForm hardcoded "High Risk" instead).
  it("derives risk_level from likelihood and severity via RiskCalculator on save", async () => {
    updateMutateAsync.mockResolvedValue({ status: 202, data: {} });
    const getRiskLevelSpy = vi.spyOn(RiskCalculator, "getRiskLevel");

    renderWithProviders(
      <AddNewRisk isOpen={true} setIsOpen={vi.fn()} vendors={[]} existingRisk={existingRisk} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    // existingRisk: likelihood "Possible" (3) + severity "Major" (4) → 3×1 + 4×3 = 15 → "High risk"
    expect(getRiskLevelSpy).toHaveBeenCalledWith("Possible", "Major");
    const payload = updateMutateAsync.mock.calls[0][0];
    expect(payload).toMatchObject({
      id: 7,
      data: {
        risk_level: "High risk",
        likelihood: "Possible",
        risk_severity: "Major",
      },
    });
    // The computed level replaces the stored value, not a restatement of it.
    expect(payload.data.risk_level).not.toBe(existingRisk.risk_level);

    getRiskLevelSpy.mockRestore();
  });
});

// Accepting a research finding writes the model's texts into the register, up to 300 characters
// each. The form checks all three on every save, so it must take what the server takes
// (VENDOR_RISK_VALIDATION_LIMITS: 500, 500 and 1000), or no later edit of that risk could be saved.
describe("NewRisk (AddNewRisk), the length of the three texts", () => {
  const vendors = [{ id: 3, vendor_name: "Acme Cloud" } as unknown as VendorModel];
  const text = (length: number) => "x".repeat(length);

  /** An existing risk with texts of the given lengths, opened for editing, and Save clicked. */
  const saveRiskWith = async (lengths: { risk: number; impact: number; plan: number }) => {
    updateMutateAsync.mockResolvedValue({ status: 202, data: {} });
    renderWithProviders(
      <AddNewRisk
        isOpen={true}
        setIsOpen={vi.fn()}
        vendors={vendors}
        existingRisk={{
          ...existingRisk,
          risk_description: text(lengths.risk),
          impact_description: text(lengths.impact),
          action_plan: text(lengths.plan),
        }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
  };

  beforeEach(() => {
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    // jsdom does not implement scrollIntoView, which a failed save calls on its way to the first
    // invalid field.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("saves a risk whose three texts are 300 characters long, as the research accept writes them", async () => {
    await saveRiskWith({ risk: 300, impact: 300, plan: 300 });

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 7,
      data: expect.objectContaining({
        risk_description: text(300),
        impact_description: text(300),
        action_plan: text(300),
      }),
    });
    expect(screen.queryByText(/can't be longer than/)).not.toBeInTheDocument();
  });

  it("saves texts that are exactly as long as the server takes", async () => {
    await saveRiskWith({ risk: 500, impact: 500, plan: 1000 });

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/can't be longer than/)).not.toBeInTheDocument();
  });

  it.each([
    ["risk description", { risk: 501, impact: 10, plan: 10 }, "Risk description", 500],
    ["impact description", { risk: 10, impact: 501, plan: 10 }, "Impact description", 500],
    ["action plan", { risk: 10, impact: 10, plan: 1001 }, "Action plan", 1000],
  ])("refuses a %s that is one character over the limit", async (_name, lengths, title, max) => {
    await saveRiskWith(lengths);

    expect(
      await screen.findByText(`${title} can't be longer than ${max} characters.`),
    ).toBeVisible();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });
});
