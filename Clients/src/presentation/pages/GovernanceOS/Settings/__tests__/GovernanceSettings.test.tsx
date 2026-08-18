import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockIsAdmin = true;
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => mockIsAdmin,
}));

let mockPreferences: any = null;
let mockPrefsLoading = false;
const mockMutate = vi.fn();
let mockMutationPending = false;

vi.mock("../../../../../application/hooks/useGovernanceOs", () => ({
  useGovernancePreferences: () => ({ data: mockPreferences, isLoading: mockPrefsLoading }),
  useUpdatePreferences: () => ({ mutate: mockMutate, isPending: mockMutationPending }),
}));

import GovernanceSettings from "../index";

describe("GovernanceSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = true;
    mockPreferences = null;
    mockPrefsLoading = false;
    mockMutationPending = false;
  });

  it("shows a spinner while preferences are loading", () => {
    mockPrefsLoading = true;
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the module status, active scenario, and mapping filter sections", () => {
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    expect(screen.getByText("Module Status")).toBeInTheDocument();
    expect(screen.getByText("Active Scenario")).toBeInTheDocument();
    expect(screen.getByText("Smart Prompt Preferences")).toBeInTheDocument();
    expect(screen.getByText("Mapping Filters")).toBeInTheDocument();
    expect(screen.getByText("No active scenario selected.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No default filters configured. Filters are set per-session in the Framework Mapper.",
      ),
    ).toBeInTheDocument();
  });

  it("initializes toggle state from preferences", () => {
    mockPreferences = { is_enabled: true, dont_ask_governance_os: true };
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("shows active scenario details with framework chips when a scenario is selected", () => {
    mockPreferences = {
      selected_scenario_id: 7,
      custom_framework_priority: { primary: 1, secondary: [2, 3] },
    };
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    expect(screen.getByText("Scenario ID: 7")).toBeInTheDocument();
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
    expect(screen.getByText("ISO 27001")).toBeInTheDocument();
  });

  it("shows configured mapping filters as JSON when present", () => {
    mockPreferences = { active_mapping_filters: { domain: "privacy" } };
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    expect(screen.getByText(/Custom filters:/)).toBeInTheDocument();
  });

  it("navigates to scenarios when 'Choose scenario' is clicked", () => {
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    fireEvent.click(screen.getByRole("button", { name: "Choose scenario" }));
    expect(mockNavigate).toHaveBeenCalledWith("/governance/scenarios");
  });

  it("navigates to the framework mapper when 'Open Framework Mapper' is clicked", () => {
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    fireEvent.click(screen.getByRole("button", { name: "Open Framework Mapper" }));
    expect(mockNavigate).toHaveBeenCalledWith("/governance/framework-mapper");
  });

  it("disables the module status toggle for non-admins", () => {
    mockIsAdmin = false;
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText("Only admins can change module status.")).toBeInTheDocument();
  });

  it("toggles the 'don't ask again' checkbox and resets it", () => {
    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    const resetButton = screen.getByRole("button", { name: "Reset prompt preference" });
    expect(resetButton).not.toBeDisabled();
    fireEvent.click(resetButton);
    expect(checkbox).not.toBeChecked();
  });

  it("saves settings and shows a success alert", async () => {
    mockMutate.mockImplementation((_body, options) => {
      options?.onSuccess?.();
    });

    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(mockMutate).toHaveBeenCalledWith(
      { is_enabled: false, dont_ask_governance_os: false },
      expect.any(Object),
    );

    await waitFor(() => {
      expect(screen.getByText("Settings saved successfully.")).toBeInTheDocument();
    });
  });

  it("shows an error alert when saving fails", async () => {
    mockMutate.mockImplementation((_body, options) => {
      options?.onError?.();
    });

    renderWithProviders(<GovernanceSettings />, { route: "/governance/settings" });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to save settings. Please try again.")).toBeInTheDocument();
    });
  });
});
