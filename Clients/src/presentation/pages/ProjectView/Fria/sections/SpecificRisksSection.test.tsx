import { screen, fireEvent, waitFor } from "@testing-library/react";
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

const mockGetAllProjectRisksByProjectId = vi.fn();
vi.mock("../../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: (...args: any[]) => mockGetAllProjectRisksByProjectId(...args),
}));

import SpecificRisksSection from "./SpecificRisksSection";
import type { FriaAssessment, FriaRiskItem } from "../../../../../application/hooks/useFria";

const baseAssessment = {
  id: 1,
  project_id: 9,
  risk_scenarios: "",
  provider_info_used: "",
} as unknown as FriaAssessment;

const riskItems: FriaRiskItem[] = [
  {
    id: 1,
    fria_id: 1,
    risk_description: "Bias in outputs",
    likelihood: "Medium",
    severity: "High",
    existing_controls: "Human review",
    further_action: null,
    linked_project_risk_id: null,
    linked_risk_name: null,
    sort_order: 1,
  },
];

describe("SpecificRisksSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: [] });
  });

  it("fetches active project risks for linking on mount", async () => {
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    await waitFor(() => {
      expect(mockGetAllProjectRisksByProjectId).toHaveBeenCalledWith({
        projectId: "9",
        filter: "active",
      });
    });
  });

  it("shows an empty state when there are no risk items", () => {
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByText("No risk items yet. Add a risk to get started.")).toBeInTheDocument();
  });

  it("renders existing risk items in the register", () => {
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={riskItems}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    expect(screen.getByDisplayValue("Bias in outputs")).toBeInTheDocument();
  });

  it("calls onAddRiskItem when 'Add risk' is clicked", () => {
    const onAddRiskItem = vi.fn();
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={onAddRiskItem}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add risk" }));
    expect(onAddRiskItem).toHaveBeenCalledWith({ risk_description: "New risk" });
  });

  it("calls onDeleteRiskItem when the delete icon is clicked", () => {
    const onDeleteRiskItem = vi.fn();
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={riskItems}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={onDeleteRiskItem}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete risk item" }));
    expect(onDeleteRiskItem).toHaveBeenCalledWith(1);
  });

  it("calls onUpdateRiskItem with edited risk description on blur", () => {
    const onUpdateRiskItem = vi.fn();
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={riskItems}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={onUpdateRiskItem}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    const descField = screen.getByDisplayValue("Bias in outputs");
    fireEvent.change(descField, { target: { value: "Updated bias risk" } });
    fireEvent.blur(descField);

    expect(onUpdateRiskItem).toHaveBeenCalledWith(1, { risk_description: "Updated bias risk" });
  });

  it("opens the import modal when 'Import from project risks' is clicked", async () => {
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import from project risks" }));

    await waitFor(() => {
      expect(
        screen.getByText("Select project risks to import into the FRIA risk register."),
      ).toBeInTheDocument();
    });
  });

  it("calls onUpdate with risk scenarios text on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={onUpdate}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    const field = screen.getByLabelText("Risk scenarios");
    fireEvent.change(field, { target: { value: "System may deny access unfairly" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({ risk_scenarios: "System may deny access unfairly" });
  });

  it("calls onUpdate with provider info used text on blur when changed", () => {
    const onUpdate = vi.fn();
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={onUpdate}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    const field = screen.getByLabelText("Provider information used");
    fireEvent.change(field, { target: { value: "Vendor conformity assessment" } });
    fireEvent.blur(field);

    expect(onUpdate).toHaveBeenCalledWith({
      provider_info_used: "Vendor conformity assessment",
    });
  });

  it("resets to an empty risk options list when the fetch fails", async () => {
    mockGetAllProjectRisksByProjectId.mockRejectedValue(new Error("fail"));
    renderWithProviders(
      <SpecificRisksSection
        assessment={baseAssessment}
        riskItems={[]}
        projectId="9"
        onUpdate={vi.fn()}
        onAddRiskItem={vi.fn()}
        onUpdateRiskItem={vi.fn()}
        onDeleteRiskItem={vi.fn()}
        isSaving={false}
      />,
    );

    await waitFor(() => expect(mockGetAllProjectRisksByProjectId).toHaveBeenCalled());
    expect(screen.getByText("No risk items yet. Add a risk to get started.")).toBeInTheDocument();
  });
});
