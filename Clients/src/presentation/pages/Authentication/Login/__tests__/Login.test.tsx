import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import Login from "../index";

// Mock the SVG import used by Login
vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("Login Page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders the login form with email and password fields", () => {
    renderWithProviders(<Login />, { route: "/login" });

    expect(screen.getByText("Verify", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Wise")).toBeInTheDocument();
    expect(screen.getByText("Log in to your account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("name.surname@companyname.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders 'Forgot password' link", () => {
    renderWithProviders(<Login />, { route: "/login" });

    expect(screen.getByText("Forgot password")).toBeInTheDocument();
  });

  it("navigates to /forgot-password when 'Forgot password' is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Login />, { route: "/login" });

    await user.click(screen.getByText("Forgot password"));

    expect(mockNavigate).toHaveBeenCalledWith("/forgot-password", expect.anything());
  });
});
