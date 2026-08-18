import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import AlertsSection from "./AlertsSection";
import { MrmModelRole, MrmTier } from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow, IMrmModelRole, IMrmOrgSettings } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";

const mockUseMrmSettings = vi.fn();
const mockUseUpdateMrmSettings = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseFleetTiering = vi.fn();
const mockUseModelRoles = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useMrmSettings: () => mockUseMrmSettings(),
  useUpdateMrmSettings: () => mockUseUpdateMrmSettings(),
  useFleetTiering: () => mockUseFleetTiering(),
  useModelRoles: () => mockUseModelRoles(),
}));

const users: MrmUser[] = [
  { id: 1, name: "Jane", surname: "Doe", email: "jane@example.com" },
  { id: 2, name: "John", surname: "Smith" },
];

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

const roles: IMrmModelRole[] = [
  { id: 1, organization_id: 1, model_inventory_id: 1, role: MrmModelRole.OWNER, user_id: 1 },
];

const settings: IMrmOrgSettings = {
  organization_id: 1,
  retention_months: 24,
  alert_email_enabled: false,
  breach_auto_open_finding: false,
  alert_recipients: [],
};

describe("AlertsSection", () => {
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMrmSettings.mockReturnValue({ data: settings });
    mockUseUpdateMrmSettings.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
    mockUseFleetTiering.mockReturnValue({ data: fleet });
    mockUseModelRoles.mockReturnValue({ data: [] });
  });

  it("prompts to select a model before showing role recipients", () => {
    renderWithProviders(<AlertsSection users={users} onError={onError} onSuccess={onSuccess} />);
    expect(
      screen.getByText("Select a model to see who is notified of its breaches."),
    ).toBeInTheDocument();
  });

  it("saves the alert settings toggles", async () => {
    mockMutateAsync.mockResolvedValue({});
    renderWithProviders(<AlertsSection users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByText("Send email alerts"));
    fireEvent.click(screen.getByTestId("mrm-save-alerts-btn"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        alert_email_enabled: true,
        breach_auto_open_finding: false,
        alert_recipients: [],
      });
      expect(onSuccess).toHaveBeenCalledWith("Alert settings saved");
    });
  });

  it("surfaces an error when saving fails", async () => {
    mockMutateAsync.mockRejectedValue(new Error("boom"));
    renderWithProviders(<AlertsSection users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.click(screen.getByTestId("mrm-save-alerts-btn"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("Failed to save alert settings");
    });
  });

  it("shows role notification recipients once a model is selected", async () => {
    mockUseModelRoles.mockReturnValue({ data: roles });
    renderWithProviders(<AlertsSection users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getAllByText("Yes").length).toBeGreaterThan(0);
  });

  it("shows 'Unassigned' when a role has no user", async () => {
    mockUseModelRoles.mockReturnValue({ data: [] });
    renderWithProviders(<AlertsSection users={users} onError={onError} onSuccess={onSuccess} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
  });
});
