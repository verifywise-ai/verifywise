import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

let mockUserRoleName = "Admin";
const mockOpenUserGuide = vi.fn();
const mockMutate = vi.fn();
let mockIsPending = false;

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

vi.mock("../../../components/UserGuide", () => ({
  useUserGuideSidebarContext: () => ({ open: mockOpenUserGuide }),
}));

vi.mock("../../../../application/hooks/useGovernanceOs", () => ({
  useUpdatePreferences: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

import GovernanceOSEnableCTA from "../GovernanceOSEnableCTA";

describe("GovernanceOSEnableCTA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockIsPending = false;
  });

  it("renders the feature list and enable button", () => {
    renderWithProviders(<GovernanceOSEnableCTA />);

    expect(screen.getByText("Core Governance OS")).toBeInTheDocument();
    expect(screen.getByText("Framework Mapper")).toBeInTheDocument();
    expect(screen.getByText("Scenario Builder")).toBeInTheDocument();
    expect(screen.getByText("Unified Insights")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enable Governance Intelligence" }),
    ).toBeInTheDocument();
  });

  it("enables the button for admin users and calls mutate on click", () => {
    renderWithProviders(<GovernanceOSEnableCTA />);

    const button = screen.getByRole("button", { name: "Enable Governance Intelligence" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    expect(mockMutate).toHaveBeenCalledWith({ is_enabled: true }, expect.any(Object));
  });

  it("calls onEnabled after a successful mutation", () => {
    const onEnabled = vi.fn();
    mockMutate.mockImplementation((_body, options) => {
      options?.onSuccess?.();
    });

    renderWithProviders(<GovernanceOSEnableCTA onEnabled={onEnabled} />);

    fireEvent.click(screen.getByRole("button", { name: "Enable Governance Intelligence" }));

    expect(onEnabled).toHaveBeenCalled();
  });

  it("disables the button for non-admin users", () => {
    mockUserRoleName = "Editor";
    renderWithProviders(<GovernanceOSEnableCTA />);

    expect(screen.getByRole("button", { name: "Enable Governance Intelligence" })).toBeDisabled();
  });

  it("shows an 'Enabling...' label while the mutation is pending", () => {
    mockIsPending = true;
    renderWithProviders(<GovernanceOSEnableCTA />);

    expect(screen.getByRole("button", { name: "Enabling..." })).toBeDisabled();
  });

  it("opens the user guide when 'Learn more' is clicked", async () => {
    renderWithProviders(<GovernanceOSEnableCTA />);

    fireEvent.click(screen.getByRole("button", { name: "Learn more in the user guide" }));

    await waitFor(() => {
      expect(mockOpenUserGuide).toHaveBeenCalledWith("governance-os");
    });
  });
});
