/**
 * Tests for the Master Control Drawer shell — focus on load/error/empty
 * states and title rendering. The individual tabs are mocked so this suite
 * is isolated to the drawer's shell logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MasterControlDrawer from "../components/MasterControlDrawer";
import { MasterControlModel } from "../../../../domain/models/Common/masterControl/masterControl.model";

// ---- Mocks ----

const mockUseMasterControl = vi.fn();

vi.mock("../../../../application/hooks/useMasterControls", () => ({
  useMasterControl: (id: number | null | undefined) => mockUseMasterControl(id),
}));

vi.mock("../components/MasterControlDrawer/DetailsTab", () => ({
  default: ({ master }: { master: MasterControlModel }) => (
    <div data-testid="details-tab">Details for {master.title}</div>
  ),
}));

vi.mock("../components/MasterControlDrawer/MappingsTab", () => ({
  default: () => <div data-testid="mappings-tab" />,
}));

vi.mock("../components/MasterControlDrawer/EvidenceTab", () => ({
  default: () => <div data-testid="evidence-tab" />,
}));

vi.mock("../components/MasterControlDrawer/HistoryTab", () => ({
  default: () => <div data-testid="history-tab" />,
}));

function setMaster(master: Partial<MasterControlModel> | null) {
  mockUseMasterControl.mockReturnValue({
    data: master ? new MasterControlModel(master as MasterControlModel) : null,
    isLoading: false,
    error: null,
  });
}

describe("MasterControlDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the master control title when data is loaded", () => {
    setMaster({ id: 1, title: "Encryption at rest", status: "Waiting" });

    renderWithProviders(
      <MasterControlDrawer open onClose={vi.fn()} masterControlId={1} />
    );

    expect(screen.getByText("Encryption at rest")).toBeInTheDocument();
  });

  it("defaults to the Details tab on first open", () => {
    setMaster({ id: 1, title: "Access review", status: "Waiting" });

    renderWithProviders(
      <MasterControlDrawer open onClose={vi.fn()} masterControlId={1} />
    );

    expect(screen.getByTestId("details-tab")).toBeInTheDocument();
    expect(screen.getByText("Details for Access review")).toBeInTheDocument();
  });

  it("shows a loading indicator while the master control is fetching", () => {
    mockUseMasterControl.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    renderWithProviders(
      <MasterControlDrawer open onClose={vi.fn()} masterControlId={7} />
    );

    expect(screen.getByText(/Loading master control/)).toBeInTheDocument();
  });

  it("surfaces a friendly error message when the fetch fails", () => {
    mockUseMasterControl.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Network failure"),
    });

    renderWithProviders(
      <MasterControlDrawer open onClose={vi.fn()} masterControlId={9} />
    );

    expect(
      screen.getByText(/Failed to load this master control/)
    ).toBeInTheDocument();
  });

  it("fires onClose when the close button is activated", () => {
    setMaster({ id: 1, title: "Vendor risk review", status: "Waiting" });
    const onClose = vi.fn();

    renderWithProviders(
      <MasterControlDrawer open onClose={onClose} masterControlId={1} />
    );

    screen.getByLabelText("Close drawer").click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
