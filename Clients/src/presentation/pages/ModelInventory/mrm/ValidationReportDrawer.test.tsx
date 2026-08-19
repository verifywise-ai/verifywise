import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ValidationReportDrawer from "./ValidationReportDrawer";
import {
  MrmRevalidationTriggerSource,
  MrmValidationOutcome,
  MrmValidationStage,
} from "../../../../domain/enums/mrm.enum";
import { IMrmValidation } from "../../../../domain/interfaces/i.mrm";

const mockUpdateMutateAsync = vi.fn();
const mockSignoffMutateAsync = vi.fn();
const mockUseUpdateValidation = vi.fn();
const mockUseSignoffValidation = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useUpdateValidation: () => mockUseUpdateValidation(),
  useSignoffValidation: () => mockUseSignoffValidation(),
}));

const baseValidation: IMrmValidation = {
  id: 10,
  organization_id: 1,
  model_inventory_id: 1,
  stage: MrmValidationStage.IN_VALIDATION,
  trigger: undefined,
  report: {},
};

describe("ValidationReportDrawer", () => {
  const onClose = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateValidation.mockReturnValue({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    });
    mockUseSignoffValidation.mockReturnValue({
      mutateAsync: mockSignoffMutateAsync,
      isPending: false,
    });
  });

  it("renders nothing when validation is null", () => {
    renderWithProviders(
      <ValidationReportDrawer
        validation={null}
        modelName=""
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.queryByText("Save report")).not.toBeInTheDocument();
  });

  it("shows a hint when validation is not started", () => {
    renderWithProviders(
      <ValidationReportDrawer
        validation={{ ...baseValidation, stage: MrmValidationStage.NOT_STARTED }}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    expect(
      screen.getByText("Advance this validation to In validation to begin writing the report."),
    ).toBeInTheDocument();
  });

  it("renders revalidation triggers when present", () => {
    renderWithProviders(
      <ValidationReportDrawer
        validation={{
          ...baseValidation,
          report: {
            revalidation_triggers: [
              {
                source: MrmRevalidationTriggerSource.BREACH,
                reason: "PSI breach on subprime",
                at: "2026-07-01T00:00:00Z",
              },
            ],
          },
        }}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText("Triggered by")).toBeInTheDocument();
    expect(screen.getByText("Breach")).toBeInTheDocument();
    expect(screen.getByText(/PSI breach on subprime/)).toBeInTheDocument();
  });

  it("saves the report", async () => {
    mockUpdateMutateAsync.mockResolvedValue({});
    renderWithProviders(
      <ValidationReportDrawer
        validation={baseValidation}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByText("Save report"));

    await waitFor(() => {
      expect(mockUpdateMutateAsync).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith("Validation report saved");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("surfaces an error when saving the report fails", async () => {
    mockUpdateMutateAsync.mockRejectedValue(new Error("boom"));
    renderWithProviders(
      <ValidationReportDrawer
        validation={baseValidation}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByText("Save report"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Failed to save validation report");
    });
  });

  it("hides the submit button and shows a read-only report once signed off", () => {
    renderWithProviders(
      <ValidationReportDrawer
        validation={{ ...baseValidation, stage: MrmValidationStage.VALIDATED }}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.queryByText("Save report")).not.toBeInTheDocument();
  });

  it("opens the sign-off modal and requires an outcome", async () => {
    renderWithProviders(
      <ValidationReportDrawer
        validation={baseValidation}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByTestId("mrm-signoff-btn"));

    await waitFor(() => {
      expect(screen.getByText("Sign off validation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Sign off"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Select an outcome to sign off.");
    });
  });

  it("signs off the validation with the selected outcome", async () => {
    mockSignoffMutateAsync.mockResolvedValue({});
    renderWithProviders(
      <ValidationReportDrawer
        validation={baseValidation}
        modelName="GPT-4"
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByTestId("mrm-signoff-btn"));
    const outcomeSelect = await screen.findByRole("combobox");
    fireEvent.mouseDown(outcomeSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Validated" }));

    fireEvent.click(screen.getByText("Sign off"));

    await waitFor(() => {
      expect(mockSignoffMutateAsync).toHaveBeenCalledWith({
        id: 10,
        payload: { outcome: MrmValidationOutcome.VALIDATED, report_version: null },
      });
      expect(onSuccess).toHaveBeenCalledWith("Validation signed off");
    });
  });
});
