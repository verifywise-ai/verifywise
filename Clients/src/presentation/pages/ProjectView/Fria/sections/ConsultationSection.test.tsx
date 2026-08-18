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

import ConsultationSection from "./ConsultationSection";
import type { FriaAssessment } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  legal_review: null,
  dpo_review: null,
  owner_approval: null,
  stakeholders_consulted: "",
  consultation_notes: "",
} as unknown as FriaAssessment;

describe("ConsultationSection", () => {
  it("calls onUpdate when the legal review select changes", async () => {
    const onUpdate = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ConsultationSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    await user.click(comboboxes[0]);
    const option = await screen.findByRole("option", { name: "Yes" });
    await user.click(option);

    expect(onUpdate).toHaveBeenCalledWith({ legal_review: "Yes" });
  });

  it("calls onUpdate with stakeholders consulted text on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <ConsultationSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const field = screen.getByLabelText("Stakeholders consulted");
    fireEvent.change(field, { target: { value: "DPO and legal team" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ stakeholders_consulted: "DPO and legal team" });
  });

  it("calls onUpdate with consultation notes on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <ConsultationSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const field = screen.getByLabelText("Consultation notes");
    fireEvent.change(field, { target: { value: "No concerns raised" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ consultation_notes: "No concerns raised" });
  });

  it("does not call onUpdate on blur when text is unchanged", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <ConsultationSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    fireEvent.blur(screen.getByLabelText("Stakeholders consulted"));
    fireEvent.blur(screen.getByLabelText("Consultation notes"));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("disables selects and fields while saving", () => {
    renderWithProviders(
      <ConsultationSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={true} />,
    );

    screen.getAllByRole("combobox").forEach((combobox) => {
      expect(combobox).toHaveAttribute("aria-disabled", "true");
    });
    expect(screen.getByLabelText("Stakeholders consulted")).toBeDisabled();
  });
});
