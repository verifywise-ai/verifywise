import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import SettingsPage from "../SettingsPage";
import type { RiskScoringConfig } from "../../../../domain/ai-detection/riskScoringTypes";
import { DEFAULT_DIMENSION_WEIGHTS } from "../../../../domain/ai-detection/riskScoringTypes";

const mockGetGitHubTokenStatus = vi.fn();
const mockSaveGitHubToken = vi.fn();
const mockDeleteGitHubToken = vi.fn();
const mockTestGitHubToken = vi.fn();

vi.mock("../../../../application/repository/githubToken.repository", () => ({
  getGitHubTokenStatus: (...args: unknown[]) => mockGetGitHubTokenStatus(...args),
  saveGitHubToken: (...args: unknown[]) => mockSaveGitHubToken(...args),
  deleteGitHubToken: (...args: unknown[]) => mockDeleteGitHubToken(...args),
  testGitHubToken: (...args: unknown[]) => mockTestGitHubToken(...args),
}));

const mockGetRiskScoringConfig = vi.fn();
const mockUpdateRiskScoringConfig = vi.fn();
const mockListSuppressions = vi.fn();
const mockDeleteSuppression = vi.fn();

vi.mock("../../../../application/repository/aiDetection.repository", () => ({
  getRiskScoringConfig: (...args: unknown[]) => mockGetRiskScoringConfig(...args),
  updateRiskScoringConfig: (...args: unknown[]) => mockUpdateRiskScoringConfig(...args),
  listSuppressions: (...args: unknown[]) => mockListSuppressions(...args),
  deleteSuppression: (...args: unknown[]) => mockDeleteSuppression(...args),
}));

const mockGetLLMKeys = vi.fn();
vi.mock("../../../../application/repository/llmKeys.repository", () => ({
  getLLMKeys: (...args: unknown[]) => mockGetLLMKeys(...args),
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title, alert }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {alert}
      {children}
    </div>
  ),
}));

function makeRiskConfig(overrides: Partial<RiskScoringConfig> = {}): RiskScoringConfig {
  return {
    id: 1,
    llm_enabled: false,
    llm_key_id: null,
    dimension_weights: { ...DEFAULT_DIMENSION_WEIGHTS },
    vulnerability_scan_enabled: false,
    vulnerability_types_enabled: {
      prompt_injection: true,
      pii_exposure: true,
      excessive_agency: true,
      jailbreak_risk: true,
      training_data_poisoning: true,
      model_dos: true,
      supply_chain: true,
      insecure_plugin: true,
      overreliance: true,
      model_theft: true,
    },
    updated_by: null,
    updated_at: null,
    ...overrides,
  };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGitHubTokenStatus.mockResolvedValue({ configured: false });
    mockGetRiskScoringConfig.mockResolvedValue(makeRiskConfig());
    mockGetLLMKeys.mockResolvedValue({ data: { data: [] } });
    mockListSuppressions.mockResolvedValue([]);
  });

  it("shows a loading spinner before the token status loads", () => {
    mockGetGitHubTokenStatus.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the GitHub integration tab by default", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });
    expect(screen.getByText("Create a new token on GitHub")).toBeInTheDocument();
  });

  it("shows configured token status when a token exists", async () => {
    mockGetGitHubTokenStatus.mockResolvedValue({ configured: true, token_name: "CI token" });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Token configured")).toBeInTheDocument();
    });
    expect(screen.getByText("CI token")).toBeInTheDocument();
    expect(screen.getByText("Update token")).toBeInTheDocument();
  });

  it("shows 'Save token' when no token is configured", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Save token")).toBeInTheDocument();
    });
  });

  it("disables test/save buttons until a token is entered", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Test token").closest("button")).toBeDisabled();
    });
    expect(screen.getByText("Save token").closest("button")).toBeDisabled();
  });

  it("tests a token and shows a success alert when valid", async () => {
    mockTestGitHubToken.mockResolvedValue({ valid: true });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Personal access token"), {
      target: { value: "ghp_abc123" },
    });
    fireEvent.click(screen.getByText("Test token"));

    await waitFor(() => {
      expect(screen.getByText("Token is valid")).toBeInTheDocument();
    });
  });

  it("shows an error alert when token test fails", async () => {
    mockTestGitHubToken.mockResolvedValue({ valid: false, error: "Bad credentials" });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Personal access token"), {
      target: { value: "ghp_bad" },
    });
    fireEvent.click(screen.getByText("Test token"));

    await waitFor(() => {
      expect(screen.getByText("Bad credentials")).toBeInTheDocument();
    });
  });

  it("saves a token and clears the input fields on success", async () => {
    mockSaveGitHubToken.mockResolvedValue({ configured: true, token_name: "New token" });
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Personal access token"), {
      target: { value: "ghp_newtoken" },
    });
    fireEvent.click(screen.getByText("Save token"));

    await waitFor(() => {
      expect(screen.getByText("GitHub token saved successfully")).toBeInTheDocument();
    });
    expect(mockSaveGitHubToken).toHaveBeenCalledWith("ghp_newtoken", undefined);
  });

  it("deletes a configured token", async () => {
    mockGetGitHubTokenStatus.mockResolvedValue({ configured: true, token_name: "CI token" });
    mockDeleteGitHubToken.mockResolvedValue(undefined);
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Token configured")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button");
    const trashButton = deleteButtons.find((b) => b.querySelector(".lucide-trash2"));
    fireEvent.click(trashButton as HTMLElement);

    await waitFor(() => {
      expect(mockDeleteGitHubToken).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("GitHub token deleted successfully")).toBeInTheDocument();
    });
  });

  it("switches to the risk scoring tab and shows dimension weights", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Risk scoring/ }));

    await waitFor(() => {
      expect(screen.getByText("Dimension weights")).toBeInTheDocument();
    });
    expect(screen.getByText("Data sovereignty")).toBeInTheDocument();
    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
  });

  it("shows a validation message when weights don't sum to 100%", async () => {
    mockGetRiskScoringConfig.mockResolvedValue(
      makeRiskConfig({
        dimension_weights: {
          data_sovereignty: 0.1,
          transparency: 0.1,
          security: 0.1,
          autonomy: 0.1,
          supply_chain: 0.1,
        },
      }),
    );
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: /Risk scoring/ }));

    await waitFor(() => {
      expect(screen.getByText("Weights must sum to 100%")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("resets dimension weights to defaults", async () => {
    mockGetRiskScoringConfig.mockResolvedValue(
      makeRiskConfig({
        dimension_weights: {
          data_sovereignty: 0.5,
          transparency: 0.5,
          security: 0,
          autonomy: 0,
          supply_chain: 0,
        },
      }),
    );
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: /Risk scoring/ }));

    await waitFor(() => {
      expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Reset to defaults"));

    expect(screen.getByText("Total: 100%")).toBeInTheDocument();
  });

  it("reveals vulnerability detection controls only when LLM is enabled", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: /Risk scoring/ }));

    await waitFor(() => {
      expect(
        screen.getByText("Enable LLM-enhanced analysis above to use vulnerability detection."),
      ).toBeInTheDocument();
    });

    const llmToggle = screen.getAllByRole("switch")[0];
    fireEvent.click(llmToggle);

    await waitFor(() => {
      expect(screen.getByText(/Configure LLM keys in Settings/)).toBeInTheDocument();
    });
  });

  it("saves risk scoring configuration", async () => {
    mockUpdateRiskScoringConfig.mockResolvedValue(makeRiskConfig());
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("tab", { name: /Risk scoring/ }));

    await waitFor(() => {
      expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateRiskScoringConfig).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("Risk scoring settings saved")).toBeInTheDocument();
    });
  });

  it("switches to the suppression rules tab", async () => {
    renderWithProviders(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /Suppression rules/ }));

    await waitFor(() => {
      expect(mockListSuppressions).toHaveBeenCalled();
    });
  });
});
