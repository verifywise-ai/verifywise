import { screen, waitFor, fireEvent } from "@testing-library/react";
import { Routes, Route } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SettingsTab from "./SettingsTab";
import { MrmModelRole, MrmTier } from "../../../../domain/enums/mrm.enum";
import { IMrmFleetRow, IMrmModelRole, IMrmOrgSettings } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";

const mockUseFleetTiering = vi.fn();
const mockUseModelRoles = vi.fn();
const mockUseSetModelRoles = vi.fn();
const mockSetRolesMutateAsync = vi.fn();
const mockUseMrmSettings = vi.fn();
const mockUseUpdateMrmSettings = vi.fn();
const mockUseThresholds = vi.fn();
const mockUseCreateThreshold = vi.fn();
const mockUseUpdateThreshold = vi.fn();
const mockUseDeleteThreshold = vi.fn();
const mockUseIngestionTokens = vi.fn();
const mockUseCreateIngestionToken = vi.fn();
const mockUseRotateIngestionToken = vi.fn();
const mockUseRevokeIngestionToken = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useFleetTiering: () => mockUseFleetTiering(),
  useModelRoles: () => mockUseModelRoles(),
  useSetModelRoles: () => mockUseSetModelRoles(),
  useMrmSettings: () => mockUseMrmSettings(),
  useUpdateMrmSettings: () => mockUseUpdateMrmSettings(),
  useThresholds: () => mockUseThresholds(),
  useCreateThreshold: () => mockUseCreateThreshold(),
  useUpdateThreshold: () => mockUseUpdateThreshold(),
  useDeleteThreshold: () => mockUseDeleteThreshold(),
  useIngestionTokens: () => mockUseIngestionTokens(),
  useCreateIngestionToken: () => mockUseCreateIngestionToken(),
  useRotateIngestionToken: () => mockUseRotateIngestionToken(),
  useRevokeIngestionToken: () => mockUseRevokeIngestionToken(),
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

const users: MrmUser[] = [{ id: 1, name: "Jane", surname: "Doe" }];

const BASE = "/model-inventory/model-risk-management/settings";

const renderSettingsTab = (route: string = BASE) =>
  renderWithProviders(
    <Routes>
      <Route
        path={`${BASE}/:settingsSection`}
        element={<SettingsTab users={users} onError={onError} onSuccess={onSuccess} />}
      />
      <Route
        path={BASE}
        element={<SettingsTab users={users} onError={onError} onSuccess={onSuccess} />}
      />
    </Routes>,
    { route },
  );

const onError = vi.fn();
const onSuccess = vi.fn();

describe("SettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFleetTiering.mockReturnValue({ data: fleet });
    mockUseModelRoles.mockReturnValue({ data: roles });
    mockUseSetModelRoles.mockReturnValue({
      mutateAsync: mockSetRolesMutateAsync,
      isPending: false,
    });
    mockUseMrmSettings.mockReturnValue({ data: settings });
    mockUseUpdateMrmSettings.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseThresholds.mockReturnValue({ data: [] });
    mockUseCreateThreshold.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseUpdateThreshold.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseDeleteThreshold.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseIngestionTokens.mockReturnValue({ data: [] });
    mockUseCreateIngestionToken.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseRotateIngestionToken.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseRevokeIngestionToken.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  it("defaults to the metrics feed section", () => {
    renderSettingsTab();
    expect(
      screen.getByText("POST https://your-server/api/mrm/models/{externalModelKey}/metrics"),
    ).toBeInTheDocument();
  });

  it("renders every section item in the nav", () => {
    renderSettingsTab();
    [
      "Metrics feed & tokens",
      "Tiering rules",
      "Default thresholds",
      "Alerts & notifications",
      "Roles & independence",
      "Data retention",
    ].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("navigates to the tiering rules section", () => {
    renderSettingsTab();
    fireEvent.click(screen.getByText("Tiering rules"));
    expect(screen.getByText(/Tier assignment is manual in this release/)).toBeInTheDocument();
    expect(screen.getByText("Tier 1")).toBeInTheDocument();
  });

  it("assigns roles for a selected model", async () => {
    mockSetRolesMutateAsync.mockResolvedValue([]);
    renderSettingsTab(`${BASE}/roles`);

    await waitFor(() => expect(screen.getByText(/independent — they/)).toBeInTheDocument());

    const modelSelect = screen.getByRole("combobox");
    fireEvent.mouseDown(modelSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    fireEvent.click(screen.getByTestId("mrm-save-roles-btn"));

    await waitFor(() => {
      expect(mockSetRolesMutateAsync).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalledWith("Roles saved");
    });
  });

  it("rejects assigning the same user as developer and validator", async () => {
    mockUseModelRoles.mockReturnValue({
      data: [
        {
          id: 1,
          organization_id: 1,
          model_inventory_id: 1,
          role: MrmModelRole.DEVELOPER,
          user_id: 1,
        },
        {
          id: 2,
          organization_id: 1,
          model_inventory_id: 1,
          role: MrmModelRole.VALIDATOR,
          user_id: 1,
        },
      ],
    });
    renderSettingsTab(`${BASE}/roles`);

    const modelSelect = await screen.findByRole("combobox");
    fireEvent.mouseDown(modelSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI · GPT-4 (v1.0)" }));

    fireEvent.click(screen.getByTestId("mrm-save-roles-btn"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        "The validator must be independent — they cannot also be the developer.",
      );
    });
  });

  it("navigates to alerts and retention sections", () => {
    renderSettingsTab();

    fireEvent.click(screen.getByText("Alerts & notifications"));
    expect(screen.getByText(/Who hears about a breach/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Data retention"));
    expect(screen.getByText(/Benign monitoring points older than/)).toBeInTheDocument();
  });

  it("navigates to the default thresholds section", () => {
    renderSettingsTab();
    fireEvent.click(screen.getByText("Default thresholds"));
    expect(screen.getByText(/Thresholds VerifyWise evaluates/)).toBeInTheDocument();
  });

  it("falls back to the metrics-feed section for an unrecognised slug", () => {
    renderSettingsTab(`${BASE}/unknown-section`);
    expect(
      screen.getByText("POST https://your-server/api/mrm/models/{externalModelKey}/metrics"),
    ).toBeInTheDocument();
  });
});
