import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockUserRoleName = "Admin";
vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

const mockToggleMode = vi.fn();
let mockIsQuantitative = false;
let mockModeLoading = false;

vi.mock("../../../../../application/hooks/useRiskAssessmentMode", () => ({
  useRiskAssessmentMode: () => ({
    isQuantitative: mockIsQuantitative,
    isLoading: mockModeLoading,
    toggleMode: mockToggleMode,
  }),
}));

import Features from "../index";

describe("Features", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockIsQuantitative = false;
    mockModeLoading = false;
  });

  it("renders the Features heading and cards", () => {
    renderWithProviders(<Features />);
    expect(screen.getByText("Features")).toBeInTheDocument();
    expect(screen.getByText("Quantitative Risk Assessment")).toBeInTheDocument();
    expect(screen.getByText("Model Lifecycle")).toBeInTheDocument();
  });

  it("shows the qualitative description when the mode is disabled", () => {
    renderWithProviders(<Features />);
    expect(screen.getByText(/risks use qualitative scoring only/)).toBeInTheDocument();
  });

  it("shows the quantitative description when the mode is enabled", () => {
    mockIsQuantitative = true;
    renderWithProviders(<Features />);
    expect(screen.getByText(/risks include monetary estimates/)).toBeInTheDocument();
  });

  it("shows a loading spinner while the mode is loading", () => {
    mockModeLoading = true;
    renderWithProviders(<Features />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an admin-only note for non-admin roles and disables the toggle", () => {
    mockUserRoleName = "Editor";
    renderWithProviders(<Features />);
    expect(screen.getByText("Only admins can change this setting.")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
  });

  it("calls toggleMode when the toggle is clicked by an admin", async () => {
    mockToggleMode.mockResolvedValue(undefined);
    renderWithProviders(<Features />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(mockToggleMode).toHaveBeenCalled();
    });
  });

  it("swallows errors from toggleMode", async () => {
    mockToggleMode.mockRejectedValue(new Error("fail"));
    renderWithProviders(<Features />);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => {
      expect(mockToggleMode).toHaveBeenCalled();
    });
  });

  it("navigates to /plugins when Manage plugins is clicked", () => {
    renderWithProviders(<Features />);
    fireEvent.click(screen.getByText("Manage plugins"));
    expect(mockNavigate).toHaveBeenCalledWith("/plugins");
  });
});
