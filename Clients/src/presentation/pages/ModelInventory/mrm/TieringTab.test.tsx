import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import TieringTab from "./TieringTab";
import { MrmTier } from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow } from "../../../../domain/interfaces/i.mrm";

const mockUseFleetTiering = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseAssignModelTier = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useFleetTiering: () => mockUseFleetTiering(),
  useAssignModelTier: () => mockUseAssignModelTier(),
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
    mrm_materiality_drivers: "capital impact",
    mrm_tiered_at: "2026-01-01T00:00:00Z",
    mrm_tiered_by: 1,
  },
  {
    id: 2,
    provider: "Anthropic",
    model: "Claude",
    version: null,
    status: "Pending",
    external_key: null,
    mrm_tier: null,
    mrm_materiality_drivers: null,
    mrm_tiered_at: null,
    mrm_tiered_by: null,
  },
];

describe("TieringTab", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAssignModelTier.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  });

  it("shows a skeleton while loading", () => {
    mockUseFleetTiering.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/Model risk tiering/)).toBeInTheDocument();
  });

  it("shows an empty state when the fleet has no models", () => {
    mockUseFleetTiering.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);
    expect(screen.getByText(/No models to tier yet/)).toBeInTheDocument();
  });

  it("renders fleet rows with tier chip and fallback dashes", () => {
    mockUseFleetTiering.mockReturnValue({ data: fleet, isLoading: false });
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);

    expect(screen.getByText("OpenAI · GPT-4 (v1.0)")).toBeInTheDocument();
    expect(screen.getByText("Tier 1")).toBeInTheDocument();
    expect(screen.getByText("Anthropic · Claude")).toBeInTheDocument();
    expect(screen.getByText("Untiered")).toBeInTheDocument();
  });

  it("filters models by the search term", async () => {
    mockUseFleetTiering.mockReturnValue({ data: fleet, isLoading: false });
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);

    const search = screen.getByLabelText("Search models");
    await userEvent.type(search, "Claude");

    expect(screen.queryByText("OpenAI · GPT-4 (v1.0)")).not.toBeInTheDocument();
    expect(screen.getByText("Anthropic · Claude")).toBeInTheDocument();
  });

  it("opens the assign-tier modal and validates a missing tier", async () => {
    mockUseFleetTiering.mockReturnValue({ data: fleet, isLoading: false });
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);

    const assignButtons = screen.getAllByText("Assign tier");
    fireEvent.click(assignButtons[1]);

    await waitFor(() => {
      expect(screen.getByText(/Set the risk tier and materiality drivers/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Select a tier before saving.");
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("assigns a tier successfully", async () => {
    mockUseFleetTiering.mockReturnValue({ data: fleet, isLoading: false });
    mockMutateAsync.mockResolvedValue({});
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getAllByText("Assign tier")[0]);

    const tierSelect = await screen.findByRole("combobox");
    fireEvent.mouseDown(tierSelect);
    const option = await screen.findByRole("option", { name: "Tier 2" });
    fireEvent.click(option);

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        modelId: 1,
        payload: { tier: MrmTier.TIER_2, materiality_drivers: "capital impact" },
      });
      expect(onSuccess).toHaveBeenCalledWith("Tier assigned");
    });
  });

  it("surfaces an error message when assignment fails", async () => {
    mockUseFleetTiering.mockReturnValue({ data: fleet, isLoading: false });
    mockMutateAsync.mockRejectedValue({ response: { data: { message: "conflict" } } });
    renderWithProviders(<TieringTab onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getAllByText("Assign tier")[0]);
    await screen.findByRole("combobox");
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("conflict");
    });
  });
});
