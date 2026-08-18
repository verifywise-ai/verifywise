import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/repository/fria.repository", () => ({
  friaRepository: {
    getEvidence: vi.fn().mockResolvedValue([]),
    linkEvidence: vi.fn(),
    unlinkEvidence: vi.fn(),
  },
}));
vi.mock("../../../../components/FilePickerModal", () => ({
  FilePickerModal: () => null,
}));
vi.mock("../../../../components/Modals/FileUpload", () => ({
  default: () => null,
}));

import ApplicabilityScopeSection from "./ApplicabilityScopeSection";
import type { FriaAssessment } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  is_high_risk: null,
  high_risk_basis: null,
  deployer_type: null,
  annex_iii_category: null,
  first_use_date: null,
  review_cycle: null,
  period_frequency: "",
  fria_rationale: "",
} as unknown as FriaAssessment;

describe("ApplicabilityScopeSection", () => {
  it("does not show the high-risk basis field until 'Yes' is selected", () => {
    renderWithProviders(
      <ApplicabilityScopeSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={false} />,
    );
    expect(screen.queryByText("High-risk basis")).not.toBeInTheDocument();
  });

  it("shows the high-risk basis field when is_high_risk is 'Yes'", () => {
    renderWithProviders(
      <ApplicabilityScopeSection
        assessment={{ ...baseAssessment, is_high_risk: "Yes" }}
        onUpdate={vi.fn()}
        isSaving={false}
      />,
    );
    expect(screen.getByText("High-risk basis")).toBeInTheDocument();
  });

  it("calls onUpdate when a select value changes", async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ApplicabilityScopeSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]); // is-high-risk select
    const option = await screen.findByRole("option", { name: "Yes" });
    await user.click(option);

    expect(onUpdate).toHaveBeenCalledWith({ is_high_risk: "Yes" });
  });

  it("calls onUpdate with the new period frequency on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <ApplicabilityScopeSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const field = screen.getByLabelText("Period / frequency details");
    fireEvent.change(field, { target: { value: "Quarterly review" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ period_frequency: "Quarterly review" });
  });

  it("calls onUpdate with the new FRIA rationale on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <ApplicabilityScopeSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const field = screen.getByLabelText("FRIA rationale");
    fireEvent.change(field, { target: { value: "Because Annex III applies" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ fria_rationale: "Because Annex III applies" });
  });

  it("does not call onUpdate on blur when text fields are unchanged", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <ApplicabilityScopeSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    fireEvent.blur(screen.getByLabelText("Period / frequency details"));
    fireEvent.blur(screen.getByLabelText("FRIA rationale"));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("disables all inputs while saving", () => {
    renderWithProviders(
      <ApplicabilityScopeSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={true} />,
    );

    screen.getAllByRole("combobox").forEach((combobox) => {
      expect(combobox).toHaveAttribute("aria-disabled", "true");
    });
    expect(screen.getByLabelText("Period / frequency details")).toBeDisabled();
  });
});
