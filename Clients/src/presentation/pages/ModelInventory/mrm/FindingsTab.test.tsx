import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import FindingsTab from "./FindingsTab";
import {
  MrmFindingSeverity,
  MrmFindingStage,
  MrmTier,
  MrmValidationStage,
} from "../../../../domain/enums/mrm.enum";
import { IMrmFinding, IMrmFleetRow, IMrmValidation } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";

const mockUseFindings = vi.fn();
const mockUseFleetTiering = vi.fn();
const mockUseValidations = vi.fn();
const mockUseCreateFinding = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockUseUpdateFinding = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useFindings: () => mockUseFindings(),
  useFleetTiering: () => mockUseFleetTiering(),
  useValidations: () => mockUseValidations(),
  useCreateFinding: () => mockUseCreateFinding(),
  useUpdateFinding: () => mockUseUpdateFinding(),
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

const validations: IMrmValidation[] = [
  {
    id: 10,
    organization_id: 1,
    model_inventory_id: 1,
    stage: MrmValidationStage.IN_VALIDATION,
    report: {},
  },
];

const users: MrmUser[] = [{ id: 1, name: "Jane", surname: "Doe" }];

const finding: IMrmFinding = {
  id: 5,
  organization_id: 1,
  model_inventory_id: 1,
  validation_id: 10,
  title: "PSI drift unmonitored",
  severity: MrmFindingSeverity.HIGH,
  stage: MrmFindingStage.OPEN,
  owner_id: 1,
  remediation_plan: null,
  due_date: null,
  closed_verified: false,
};

describe("FindingsTab", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFleetTiering.mockReturnValue({ data: fleet });
    mockUseValidations.mockReturnValue({ data: validations });
    mockUseCreateFinding.mockReturnValue({ mutateAsync: mockCreateMutateAsync, isPending: false });
    mockUseUpdateFinding.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("shows a skeleton while loading", () => {
    mockUseFindings.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<FindingsTab users={users} onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/A finding links back to the validation/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no findings", () => {
    mockUseFindings.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<FindingsTab users={users} onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No findings raised yet/)).toBeInTheDocument();
  });

  it("renders the findings table", () => {
    mockUseFindings.mockReturnValue({ data: [finding], isLoading: false });
    renderWithProviders(<FindingsTab users={users} onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("PSI drift unmonitored")).toBeInTheDocument();
    expect(screen.getByText("OpenAI · GPT-4 (v1.0)")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("opens the finding drawer on row click", async () => {
    mockUseFindings.mockReturnValue({ data: [finding], isLoading: false });
    renderWithProviders(<FindingsTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("PSI drift unmonitored"));

    await waitFor(() => {
      expect(screen.getAllByText("Finding").length).toBeGreaterThan(1);
    });
  });

  it("validates the create-finding form before submitting", async () => {
    mockUseFindings.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<FindingsTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Create finding"));
    await waitFor(() => expect(screen.getByText("Create")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Select a validation to raise the finding against.");
    });
  });

  it("creates a finding successfully", async () => {
    mockUseFindings.mockReturnValue({ data: [], isLoading: false });
    mockCreateMutateAsync.mockResolvedValue({});
    renderWithProviders(<FindingsTab users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Create finding"));
    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0));
    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(
      await screen.findByRole("option", { name: /OpenAI · GPT-4 \(v1.0\) — validation #10/ }),
    );

    const titleInput = screen.getByPlaceholderText("Short description of the finding");
    fireEvent.change(titleInput, { target: { value: "New finding" } });

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        validationId: 10,
        payload: { title: "New finding", severity: MrmFindingSeverity.MEDIUM },
      });
      expect(onSuccess).toHaveBeenCalledWith("Finding created");
    });
  });
});
