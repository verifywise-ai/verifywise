import { vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import PolicyForm from "../PolicyForm";
import type { PolicyFormData } from "../../../types/interfaces/i.policy";

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

const formData: PolicyFormData = {
  title: "AI use",
  status: "Draft",
  tags: [],
  nextReviewDate: "",
  policyOwner: null,
  assignedReviewers: [],
  content: "",
};

function openStatusOptions() {
  fireEvent.mouseDown(within(screen.getByTestId("policy-status-select")).getByRole("combobox"));
  return screen.getAllByRole("option").map((o) => o.textContent?.trim());
}

function renderForm(props: Partial<React.ComponentProps<typeof PolicyForm>> = {}) {
  renderWithProviders(
    <PolicyForm
      formData={formData}
      setFormData={vi.fn()}
      tags={[]}
      errors={{}}
      clearFieldError={vi.fn()}
      {...props}
    />,
  );
}

describe("PolicyForm status", () => {
  it("offers draft, archived and deprecated for a new policy", () => {
    renderForm({ currentStatus: null });
    expect(openStatusOptions()).toEqual(["Draft", "Archived", "Deprecated"]);
  });

  it("offers published once the policy is approved", () => {
    renderForm({ currentStatus: "Approved", formData: { ...formData, status: "Approved" } });
    expect(openStatusOptions()).toEqual([
      "Draft",
      "Approved",
      "Published",
      "Archived",
      "Deprecated",
    ]);
  });

  it("locks the status with a hint while an approval request is pending", () => {
    renderForm({
      currentStatus: "Under Review",
      statusLocked: true,
      formData: { ...formData, status: "Under Review" },
    });
    expect(screen.getByTestId("policy-status-locked-hint")).toHaveTextContent(
      "Withdraw the approval request to change the status.",
    );
    expect(
      within(screen.getByTestId("policy-status-select")).getByRole("combobox"),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
