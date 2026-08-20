import { screen, fireEvent } from "@testing-library/react";
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

import AffectedPersonsSection from "./AffectedPersonsSection";
import type { FriaAssessment } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  affected_groups: "",
  vulnerability_context: "",
  group_flags: ["Minors"],
} as unknown as FriaAssessment;

describe("AffectedPersonsSection", () => {
  it("renders all vulnerable group flag checkboxes with correct checked state", () => {
    renderWithProviders(
      <AffectedPersonsSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={false} />,
    );

    expect(screen.getByLabelText("Minors")).toBeChecked();
    expect(screen.getByLabelText("Elderly")).not.toBeChecked();
    expect(screen.getByLabelText("Other")).not.toBeChecked();
  });

  it("adds a flag when an unchecked checkbox is checked", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <AffectedPersonsSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    fireEvent.click(screen.getByLabelText("Elderly"));

    expect(onUpdate).toHaveBeenCalledWith({ group_flags: ["Minors", "Elderly"] });
  });

  it("removes a flag when a checked checkbox is unchecked", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <AffectedPersonsSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    fireEvent.click(screen.getByLabelText("Minors"));

    expect(onUpdate).toHaveBeenCalledWith({ group_flags: [] });
  });

  it("handles a missing group_flags array gracefully", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <AffectedPersonsSection
        assessment={{ ...baseAssessment, group_flags: undefined as any }}
        onUpdate={onUpdate}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByLabelText("Workers"));
    expect(onUpdate).toHaveBeenCalledWith({ group_flags: ["Workers"] });
  });

  it("calls onUpdate with affected groups text on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <AffectedPersonsSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const field = screen.getByLabelText("Affected groups description");
    fireEvent.change(field, { target: { value: "General public" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ affected_groups: "General public" });
  });

  it("calls onUpdate with vulnerability context text on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <AffectedPersonsSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const field = screen.getByLabelText("Vulnerability context");
    fireEvent.change(field, { target: { value: "Elderly users may need help" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ vulnerability_context: "Elderly users may need help" });
  });

  it("disables checkboxes and fields while saving", () => {
    renderWithProviders(
      <AffectedPersonsSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={true} />,
    );

    expect(screen.getByLabelText("Minors")).toBeDisabled();
    expect(screen.getByLabelText("Affected groups description")).toBeDisabled();
  });
});
