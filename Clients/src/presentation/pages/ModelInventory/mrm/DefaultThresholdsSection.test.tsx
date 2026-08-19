import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DefaultThresholdsSection from "./DefaultThresholdsSection";
import {
  MrmBreachAction,
  MrmThresholdOp,
  MrmThresholdSeverity,
  MrmTier,
} from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow, IMrmThreshold } from "../../../../domain/interfaces/i.mrm";

const mockUseFleetTiering = vi.fn();
const mockUseThresholds = vi.fn();
const mockUseCreateThreshold = vi.fn();
const mockUseUpdateThreshold = vi.fn();
const mockUseDeleteThreshold = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useFleetTiering: () => mockUseFleetTiering(),
  useThresholds: () => mockUseThresholds(),
  useCreateThreshold: () => mockUseCreateThreshold(),
  useUpdateThreshold: () => mockUseUpdateThreshold(),
  useDeleteThreshold: () => mockUseDeleteThreshold(),
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

const threshold: IMrmThreshold = {
  id: 1,
  organization_id: 1,
  model_inventory_id: 1,
  metric: "psi",
  segment: null,
  window: null,
  op: MrmThresholdOp.GTE,
  value_num: 0.2,
  severity: MrmThresholdSeverity.WARN,
  breach_action: MrmBreachAction.NOTIFY,
  active: true,
};

describe("DefaultThresholdsSection", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFleetTiering.mockReturnValue({ data: fleet });
    mockUseCreateThreshold.mockReturnValue({
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
    });
    mockUseUpdateThreshold.mockReturnValue({
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
    });
    mockUseDeleteThreshold.mockReturnValue({
      mutateAsync: mockDeleteMutateAsync,
      isPending: false,
    });
  });

  it("shows an empty state when there are no thresholds", () => {
    mockUseThresholds.mockReturnValue({ data: [] });
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No thresholds defined yet/)).toBeInTheDocument();
  });

  it("renders threshold rows", () => {
    mockUseThresholds.mockReturnValue({ data: [threshold] });
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText("psi")).toBeInTheDocument();
    expect(screen.getByText("≥ 0.2")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("validates required fields before creating a threshold", async () => {
    mockUseThresholds.mockReturnValue({ data: [] });
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-add-threshold-btn"));
    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Select a model for this threshold.");
    });
  });

  it("deletes a threshold", async () => {
    mockUseThresholds.mockReturnValue({ data: [threshold] });
    mockDeleteMutateAsync.mockResolvedValue({});
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-delete-threshold-btn"));

    await waitFor(() => {
      expect(mockDeleteMutateAsync).toHaveBeenCalledWith(1);
      expect(onSuccess).toHaveBeenCalledWith("Threshold deleted");
    });
  });

  it("surfaces an error when deleting a threshold fails", async () => {
    mockUseThresholds.mockReturnValue({ data: [threshold] });
    mockDeleteMutateAsync.mockRejectedValue(new Error("boom"));
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-delete-threshold-btn"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Failed to delete threshold");
    });
  });

  it("opens the edit modal pre-filled with the threshold's values", async () => {
    mockUseThresholds.mockReturnValue({ data: [threshold] });
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-edit-threshold-btn"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("psi")).toBeInTheDocument();
      expect(screen.getByDisplayValue("0.2")).toBeInTheDocument();
    });
  });

  it("creates a band threshold end to end", async () => {
    mockUseThresholds.mockReturnValue({ data: [] });
    mockCreateMutateAsync.mockResolvedValue({});
    renderWithProviders(<DefaultThresholdsSection onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-add-threshold-btn"));
    await waitFor(() => expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0));

    // Model select
    let comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    fireEvent.change(screen.getByPlaceholderText("e.g. psi, gini, auc"), {
      target: { value: "psi" },
    });

    // Shape select -> band
    comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[1]);
    fireEvent.click(await screen.findByRole("option", { name: "Band (min–max)" }));

    const minInput = screen.getByLabelText("Minimum", { exact: false });
    const maxInput = screen.getByLabelText("Maximum", { exact: false });
    fireEvent.change(minInput, { target: { value: "0.1" } });
    fireEvent.change(maxInput, { target: { value: "0.2" } });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockCreateMutateAsync).toHaveBeenCalledWith({
        modelId: 1,
        payload: {
          metric: "psi",
          op: MrmThresholdOp.OUTSIDE,
          value_num: null,
          value_lo: 0.1,
          value_hi: 0.2,
          severity: MrmThresholdSeverity.WARN,
          breach_action: MrmBreachAction.NOTIFY,
        },
      });
      expect(onSuccess).toHaveBeenCalledWith("Threshold created");
    });
  });
});
