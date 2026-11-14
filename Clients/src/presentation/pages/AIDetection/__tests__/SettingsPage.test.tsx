import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { invalidateLLMKeyQueries } from "../../../../application/hooks/useLLMKeys";
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

// The key list is cached per organization; give the page one.
const ORG_ID = 7;
vi.mock("../../../../application/hooks/useAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../application/hooks/useAuth")>();
  return { useAuth: () => ({ ...actual.useAuth(), organizationId: ORG_ID }) };
});

const openAIKey = { id: 3, name: "OpenAI", key: "sk-***", model: "gpt-4o" };
const anthropicKey = { id: 4, name: "Anthropic", key: "sk-ant-***", model: "claude-x" };

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
    const trashButton = deleteButtons.find((b) => b.querySelector(".lucide-trash"));
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

  it("opens the risk scoring tab from ?tab=risk-scoring", async () => {
    renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });

    await waitFor(() => {
      expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    });
  });

  it("does not turn vulnerability detection on by itself when LLM analysis is turned on", async () => {
    renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });

    await waitFor(() => {
      expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("switch")[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")[0]).toBeChecked();
    });
    expect(screen.getAllByRole("switch")[1]).not.toBeChecked();
  });

  describe("asking before code is sent to the LLM provider", () => {
    const renderUnchosenWithKey = async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      mockGetRiskScoringConfig.mockResolvedValue(
        makeRiskConfig({ llm_enabled: true, llm_key_id: openAIKey.id }),
      );
      mockUpdateRiskScoringConfig.mockImplementation(async (body) =>
        makeRiskConfig({
          llm_enabled: true,
          llm_key_id: openAIKey.id,
          vulnerability_scan_enabled: body.vulnerability_scan_enabled,
          vulnerability_scan_explicit: true,
        }),
      );
      renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });
      await waitFor(() => {
        expect(screen.getByText("Total: 100%")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => {
        expect(screen.getByText("Turn on vulnerability checks?")).toBeInTheDocument();
      });
    };

    it("asks first and saves nothing until the admin chooses", async () => {
      await renderUnchosenWithKey();

      expect(
        screen.getByText(
          "Vulnerability checks send code snippets from scanned files to your LLM provider.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByText("Snippets would be sent using the key OpenAI.")).toBeInTheDocument();
      expect(mockUpdateRiskScoringConfig).not.toHaveBeenCalled();
    });

    it("saves an explicit off when the admin keeps checks off", async () => {
      await renderUnchosenWithKey();
      fireEvent.click(screen.getByRole("button", { name: "Keep checks off" }));

      await waitFor(() => {
        expect(mockUpdateRiskScoringConfig).toHaveBeenCalledTimes(1);
      });
      expect(mockUpdateRiskScoringConfig.mock.calls[0][0].vulnerability_scan_enabled).toBe(false);
    });

    it("saves an explicit on when the admin turns checks on", async () => {
      await renderUnchosenWithKey();
      fireEvent.click(screen.getByRole("button", { name: "Turn on vulnerability checks" }));

      await waitFor(() => {
        expect(mockUpdateRiskScoringConfig).toHaveBeenCalledTimes(1);
      });
      expect(mockUpdateRiskScoringConfig.mock.calls[0][0].vulnerability_scan_enabled).toBe(true);
    });

    it("does not ask again once a choice is stored", async () => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });
      mockGetRiskScoringConfig.mockResolvedValue(
        makeRiskConfig({
          llm_enabled: true,
          llm_key_id: openAIKey.id,
          vulnerability_scan_enabled: false,
          vulnerability_scan_explicit: true,
        }),
      );
      mockUpdateRiskScoringConfig.mockResolvedValue(makeRiskConfig());
      renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });
      await waitFor(() => {
        expect(screen.getByText("Total: 100%")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockUpdateRiskScoringConfig).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText("Turn on vulnerability checks?")).not.toBeInTheDocument();
    });
  });

  describe("asking again when consent no longer covers the provider", () => {
    const renderWithStoredConsent = async (overrides: Partial<RiskScoringConfig>) => {
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey, anthropicKey] } });
      mockGetRiskScoringConfig.mockResolvedValue(
        makeRiskConfig({
          llm_enabled: true,
          llm_key_id: openAIKey.id,
          vulnerability_scan_enabled: true,
          vulnerability_scan_explicit: true,
          ...overrides,
        }),
      );
      mockUpdateRiskScoringConfig.mockImplementation(async (body) =>
        makeRiskConfig({
          llm_enabled: body.llm_enabled,
          llm_key_id: body.llm_key_id,
          vulnerability_scan_enabled: body.vulnerability_scan_enabled ?? false,
          vulnerability_scan_explicit: body.vulnerability_scan_enabled !== undefined,
        }),
      );
      renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });
      await waitFor(() => {
        expect(screen.getByText("Total: 100%")).toBeInTheDocument();
      });
    };

    it("asks again when the LLM key changes", async () => {
      await renderWithStoredConsent({});
      fireEvent.mouseDown(screen.getByRole("combobox"));
      fireEvent.click(await screen.findByRole("option", { name: "Anthropic — claude-x" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(screen.getByText("Turn on vulnerability checks?")).toBeInTheDocument();
      });
      expect(
        screen.getByText("Snippets would be sent using the key Anthropic."),
      ).toBeInTheDocument();
      expect(mockUpdateRiskScoringConfig).not.toHaveBeenCalled();
    });

    it("asks again when LLM analysis is turned back on with checks on", async () => {
      // The API resolves the toggle to off while LLM analysis is off
      await renderWithStoredConsent({ llm_enabled: false, vulnerability_scan_enabled: false });
      fireEvent.click(screen.getAllByRole("switch")[0]);
      await waitFor(() => {
        expect(screen.getAllByRole("switch")[1]).not.toBeDisabled();
      });
      fireEvent.click(screen.getAllByRole("switch")[1]);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(screen.getByText("Turn on vulnerability checks?")).toBeInTheDocument();
      });
      expect(mockUpdateRiskScoringConfig).not.toHaveBeenCalled();
    });

    it("keeps consent without asking when the key is unchanged", async () => {
      await renderWithStoredConsent({});
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(mockUpdateRiskScoringConfig).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText("Turn on vulnerability checks?")).not.toBeInTheDocument();
      expect(mockUpdateRiskScoringConfig.mock.calls[0][0].vulnerability_scan_enabled).toBe(true);
    });
  });

  it("keeps an explicit 'off' choice when LLM analysis is turned on", async () => {
    mockGetRiskScoringConfig.mockResolvedValue(
      makeRiskConfig({ vulnerability_scan_enabled: false, vulnerability_scan_explicit: true }),
    );
    renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });

    await waitFor(() => {
      expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByRole("switch")[0]);

    await waitFor(() => {
      expect(screen.getAllByRole("switch")[0]).toBeChecked();
    });
    expect(screen.getAllByRole("switch")[1]).not.toBeChecked();
  });

  it("does not send the vulnerability toggle while LLM analysis is off", async () => {
    mockUpdateRiskScoringConfig.mockResolvedValue(makeRiskConfig());
    renderWithProviders(<SettingsPage />, { route: "/ai-detection/settings?tab=risk-scoring" });

    await waitFor(() => {
      expect(screen.getByText("Total: 100%")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mockUpdateRiskScoringConfig).toHaveBeenCalled();
    });
    expect(mockUpdateRiskScoringConfig.mock.calls[0][0].vulnerability_scan_enabled).toBeUndefined();
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

  describe("LLM key picker", () => {
    const openRiskScoringWithKeyPicker = async () => {
      await waitFor(() => {
        expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("tab", { name: /Risk scoring/ }));
    };

    it("shows the keys from the shared query cache without fetching them again", async () => {
      mockGetRiskScoringConfig.mockResolvedValue(
        makeRiskConfig({ llm_enabled: true, llm_key_id: openAIKey.id }),
      );
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
      });
      queryClient.setQueryData(["llmKeys", ORG_ID], [openAIKey]);

      renderWithProviders(<SettingsPage />, { queryClient });
      await openRiskScoringWithKeyPicker();

      await waitFor(() => {
        expect(screen.getByText("OpenAI — gpt-4o")).toBeInTheDocument();
      });
      expect(mockGetLLMKeys).not.toHaveBeenCalled();
    });

    it("refreshes the picker when the key queries are invalidated", async () => {
      mockGetRiskScoringConfig.mockResolvedValue(
        makeRiskConfig({ llm_enabled: true, llm_key_id: anthropicKey.id }),
      );
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey] } });

      const { queryClient } = renderWithProviders(<SettingsPage />);
      await openRiskScoringWithKeyPicker();
      await waitFor(() => {
        expect(screen.queryByText(/Configure LLM keys in Settings/)).not.toBeInTheDocument();
      });
      expect(screen.queryByText("Anthropic — claude-x")).not.toBeInTheDocument();

      // A key is added elsewhere (e.g. Settings > LLM keys).
      mockGetLLMKeys.mockResolvedValue({ data: { data: [openAIKey, anthropicKey] } });
      await act(() => invalidateLLMKeyQueries(queryClient));

      await waitFor(() => {
        expect(screen.getByText("Anthropic — claude-x")).toBeInTheDocument();
      });
    });
  });
});
