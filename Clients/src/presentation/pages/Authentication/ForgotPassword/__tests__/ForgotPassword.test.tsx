import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { sendPasswordResetEmail } from "../../../../../application/repository/auth.repository";
import ForgotPassword from "../index";

// Mock SVG background
vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

// Mock navigate and location
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ state: null, pathname: "/forgot-password" }),
  };
});

// Mock auth repository
vi.mock("../../../../../application/repository/auth.repository", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

describe("ForgotPassword Page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<ForgotPassword />, {
      route: "/forgot-password",
    });

    expect(container).toBeTruthy();
  });

  it("trims the email before sending the reset request", async () => {
    (sendPasswordResetEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 200,
    });

    renderWithProviders(<ForgotPassword />, { route: "/forgot-password" });

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "  user@example.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(sendPasswordResetEmail).toHaveBeenCalledWith({
        to: "user@example.com",
        email: "user@example.com",
        name: "user@example.com",
      });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/reset-password", {
      state: { email: "user@example.com" },
    });
  });

  // Anti-enumeration: the confirmation screen must look identical whether or not
  // an account exists. A failed request (e.g. existing account + SMTP error,
  // which the backend surfaces as 500) must navigate exactly like success, so an
  // attacker cannot distinguish registered from unregistered addresses.
  it("navigates to the confirmation screen even when the reset request fails", async () => {
    (sendPasswordResetEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network error"),
    );

    renderWithProviders(<ForgotPassword />, { route: "/forgot-password" });

    fireEvent.change(screen.getByPlaceholderText("Enter your email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/reset-password", {
        state: { email: "user@example.com" },
      });
    });
  });
});
