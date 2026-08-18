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

import OrgProfileSection from "./OrgProfileSection";
import type { FriaAssessment } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  organization_name: "Acme Corp",
  project_title: "Chat Assistant",
  assessment_owner: "Jane Doe",
  assessment_date: "2024-05-01T00:00:00Z",
  operational_context: "Used internally",
} as unknown as FriaAssessment;

describe("OrgProfileSection", () => {
  it("renders read-only organisation fields and editable fields with current values", () => {
    renderWithProviders(
      <OrgProfileSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={false} />,
    );

    expect(screen.getByLabelText("Organisation name")).toHaveValue("Acme Corp");
    expect(screen.getByLabelText("Organisation name")).toBeDisabled();
    expect(screen.getByLabelText("System / project name")).toHaveValue("Chat Assistant");
    expect(screen.getByLabelText("Assessment owner")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Operational context")).toHaveValue("Used internally");
  });

  it("calls onUpdate with the new owner on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <OrgProfileSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const ownerField = screen.getByLabelText("Assessment owner");
    fireEvent.change(ownerField, { target: { value: "John Smith" } });
    fireEvent.blur(ownerField);

    expect(onUpdate).toHaveBeenCalledWith({ assessment_owner: "John Smith" });
  });

  it("does not call onUpdate on blur when the owner value is unchanged", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <OrgProfileSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const ownerField = screen.getByLabelText("Assessment owner");
    fireEvent.blur(ownerField);

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("calls onUpdate with the new operational context on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <OrgProfileSection assessment={baseAssessment} onUpdate={onUpdate} isSaving={false} />,
    );

    const contextField = screen.getByLabelText("Operational context");
    fireEvent.change(contextField, { target: { value: "Used externally too" } });
    fireEvent.blur(contextField);

    expect(onUpdate).toHaveBeenCalledWith({ operational_context: "Used externally too" });
  });

  it("handles null assessment_owner and operational_context gracefully", () => {
    renderWithProviders(
      <OrgProfileSection
        assessment={{ ...baseAssessment, assessment_owner: null, operational_context: null }}
        onUpdate={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByLabelText("Assessment owner")).toHaveValue("");
    expect(screen.getByLabelText("Operational context")).toHaveValue("");
  });

  it("disables fields while saving", () => {
    renderWithProviders(
      <OrgProfileSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={true} />,
    );

    expect(screen.getByLabelText("Assessment owner")).toBeDisabled();
    expect(screen.getByLabelText("Operational context")).toBeDisabled();
  });

  it("renders the EU AI Act reference link", () => {
    renderWithProviders(
      <OrgProfileSection assessment={baseAssessment} onUpdate={vi.fn()} isSaving={false} />,
    );

    const link = screen.getByRole("link", { name: "Article 27(1)" });
    expect(link).toHaveAttribute("href", expect.stringContaining("#art_27"));
  });
});
