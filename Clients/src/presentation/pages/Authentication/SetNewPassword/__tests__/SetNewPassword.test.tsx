import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { resetPassword } from "../../../../../application/repository/auth.repository";
import SetNewPassword from "../index";

vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../../../../../application/repository/auth.repository", () => ({
  resetPassword: vi.fn(),
}));

const token = `header.${btoa(
  JSON.stringify({ email: "user@example.com", expire: Date.now() + 60_000 }),
)}.signature`;
const route = `/set-new-password?token=${token}`;

function enterPasswords(password: string, confirmPassword: string) {
  const [passwordInput, confirmPasswordInput] = screen.getAllByPlaceholderText("••••••••");
  fireEvent.change(passwordInput, { target: { value: password } });
  fireEvent.change(confirmPasswordInput, { target: { value: confirmPassword } });
  fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
}

describe("SetNewPassword Page", () => {
  beforeEach(() => {
    vi.mocked(resetPassword).mockReset();
    mockNavigate.mockClear();
  });

  it("rejects a password without a lowercase letter", async () => {
    renderWithProviders(<SetNewPassword />, { route });

    expect(screen.getByText("Must contain at least one lowercase letter")).toBeVisible();
    enterPasswords("PASSWORD1!", "PASSWORD1!");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must contain at least one lowercase letter",
    );
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("submits a valid password with the decoded email and token", async () => {
    vi.mocked(resetPassword).mockResolvedValue({ status: 202 });
    renderWithProviders(<SetNewPassword />, { route });

    enterPasswords("Password1!", "Password1!");

    await waitFor(() => {
      expect(resetPassword).toHaveBeenCalledWith(
        { email: "user@example.com", newPassword: "Password1!" },
        token,
      );
    });
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
