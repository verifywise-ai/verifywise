import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ValidationTab from "./ValidationTab";
import { MrmTier, MrmValidationStage, MrmValidationTrigger } from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow, IMrmValidation } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";

const mockUseValidations = vi.fn();
const mockUseFleetTiering = vi.fn();
const mockUseCreateValidation = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockUseUpdateValidation = vi.fn();
const mockUseSignoffValidation = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useValidations: () => mockUseValidations(),
  useFleetTiering: () => mockUseFleetTiering(),
  useCreateValidation: () => mockUseCreateValidation(),
  useUpdateValidation: () => mockUseUpdateValidation(),
  useSignoffValidation: () => mockUseSignoffValidation(),
}));

const fleet: IMrmFleetRow[] = [
  {
    id: 1,
    provider: "OpenAI",
    model: "GPT-4",
    version: "1.0",
    status: "Approved",
    external_key: "gpt4",
    mrm_tier: MrmTier.TIER_1,
    mrm_materiality_drivers: null,
    mrm_tiered_at: null,
    mrm_tiered_by: null,
  },
];

const users: MrmUser[] = [{ id: 1, name: "Jane", surname: "Doe" }];

const validation: IMrmValidation = {
  id: 10,
  organization_id: 1,
  model_inventory_id: 1,
  stage: MrmValidationStage.IN_VALIDATION,
  trigger: MrmValidationTrigger.PERIODIC,
  validator_id: 1,
  outcome: null,
  report_version: null,
  report: {},
  signed_off_at: null,
  signed_off_by: null,
  next_due: "2027-01-01T00:00:00Z",
};

describe("ValidationTab", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFleetTiering.mockReturnValue({ data: fleet });
    mockUseCreateValidation.mockReturnValue({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    });
    mockUseUpdateValidation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseSignoffValidation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows a skeleton while loading", () => {
    mockUseValidations.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/Staged validation workflow/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no validations", () => {
    mockUseValidations.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No validations yet/)).toBeInTheDocument();
  });

  it("renders the pipeline counts and the validations table", () => {
    mockUseValidations.mockReturnValue({ data: [validation], isLoading: false });
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("OpenAI · GPT-4 (v1.0)")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("opens the validation report drawer on row click", async () => {
    mockUseValidations.mockReturnValue({ data: [validation], isLoading: false });
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("OpenAI · GPT-4 (v1.0)"));

    await waitFor(() => {
      expect(screen.getByText("Validation report")).toBeInTheDocument();
    });
  });

  it("validates a missing model before starting a validation", async () => {
    mockUseValidations.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-start-validation-btn"));
    await waitFor(() => {
      expect(screen.getAllByText("Start validation").length).toBeGreaterThan(1);
    });

    fireEvent.click(screen.getByText("Start"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Select a model to start a validation.");
    });
  });

  it("starts a validation for the selected model", async () => {
    mockUseValidations.mockReturnValue({ data: [], isLoading: false });
    mockCreateMutateAsync.mockResolvedValue({});
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-start-validation-btn"));
    const modelSelect = await screen.findByRole("combobox");
    fireEvent.mouseDown(modelSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    fireEvent.click(screen.getByText("Start"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({ modelId: 1, payload: {} });
      expect(onSuccess).toHaveBeenCalledWith("Validation started");
    });
  });

  it("excludes models with an active validation from the start-validation options", async () => {
    mockUseValidations.mockReturnValue({ data: [validation], isLoading: false });
    renderWithProviders(<ValidationTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-start-validation-btn"));
    const modelSelect = await screen.findByRole("combobox");
    fireEvent.mouseDown(modelSelect);

    expect(screen.queryByRole("option", { name: "OpenAI · GPT-4 (v1.0)" })).not.toBeInTheDocument();
  });
});
