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

import OversightSection from "./OversightSection";
import type { FriaAssessment } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  human_oversight: "",
  transparency_measures: "",
  redress_process: "",
  data_governance: "",
} as unknown as FriaAssessment;

describe("OversightSection", () => {
  it.each([
    ["Human oversight measures", "human_oversight", "A person reviews decisions"],
    ["Transparency measures", "transparency_measures", "Users are notified"],
    ["Redress and contestability process", "redress_process", "Users can appeal"],
    ["Data governance arrangements", "data_governance", "Data is anonymised"],
  ])("calls onUpdate for %s on blur when changed", (label, field, newValue) => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <OversightSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const fieldEl = screen.getByLabelText(label);
    fireEvent.change(fieldEl, { target: { value: newValue } });
    fireEvent.blur(fieldEl);

    expect(onUpdate).toHaveBeenCalledWith({ [field]: newValue });
  });

  it("does not call onUpdate on blur when values are unchanged", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <OversightSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    fireEvent.blur(screen.getByLabelText("Human oversight measures"));
    fireEvent.blur(screen.getByLabelText("Transparency measures"));
    fireEvent.blur(screen.getByLabelText("Redress and contestability process"));
    fireEvent.blur(screen.getByLabelText("Data governance arrangements"));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("disables all fields while saving", () => {
    renderWithProviders(
      <OversightSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={true} />,
    );

    expect(screen.getByLabelText("Human oversight measures")).toBeDisabled();
    expect(screen.getByLabelText("Data governance arrangements")).toBeDisabled();
  });
});
