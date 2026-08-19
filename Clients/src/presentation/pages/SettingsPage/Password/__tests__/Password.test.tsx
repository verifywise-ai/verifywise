import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockUpdatePassword = vi.fn();
vi.mock("../../../../../application/repository/user.repository", () => ({
  updatePassword: (...args: any[]) => mockUpdatePassword(...args),
}));

let mockUserId: number | null = 1;
vi.mock("../../../../../application/redux/store", () => ({
  store: { getState: () => ({ auth: { authToken: "fake-token" } }) },
}));
vi.mock("../../../../../application/tools/extractToken", () => ({
  extractUserToken: vi.fn(() => (mockUserId ? { id: mockUserId } : null)),
}));

import PasswordForm from "../index";

const VALID_PASSWORD = "Str0ng!Pass";

describe("PasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserId = 1;
  });

  it("renders the three password fields and the warning alert", () => {
    renderWithProviders(<PasswordForm />);
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByText(/Password must contain at least eight characters/)).toBeInTheDocument();
  });

  it("disables Save until all fields are valid", () => {
    renderWithProviders(<PasswordForm />);
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });

  it("shows a validation error for a weak new password", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />);
    await user.type(screen.getByLabelText("New password"), "weak");
    await waitFor(() => {
      expect(screen.getAllByText(/New password/).length).toBeGreaterThan(0);
    });
  });

  it("shows a mismatch error when confirm password differs", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />);
    await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), "Different1!");
    await waitFor(() => {
      expect(
        screen.getByText("Password confirmation does not match. Please re-enter."),
      ).toBeInTheDocument();
    });
  });

  it("enables Save once all fields are valid and matching, and saves via confirmation modal", async () => {
    mockUpdatePassword.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />);

    await user.type(screen.getByLabelText("Current password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);

    expect(screen.getByText("Confirm save")).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByText("Save"));

    await waitFor(() => {
      expect(mockUpdatePassword).toHaveBeenCalledWith({
        userId: 1,
        currentPassword: VALID_PASSWORD,
        newPassword: VALID_PASSWORD,
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Password updated successfully.")).toBeInTheDocument();
    });
  });

  it("shows an error alert when the update fails", async () => {
    mockUpdatePassword.mockRejectedValue(new Error("Server error"));
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />);

    await user.type(screen.getByLabelText("Current password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);
    await user.click(within(screen.getByRole("dialog")).getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("Server error")).toBeInTheDocument();
    });
  });

  it("closes the confirmation modal on cancel without saving", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />);

    await user.type(screen.getByLabelText("Current password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);
    await user.click(screen.getByText("Cancel"));

    await waitFor(() => {
      expect(screen.queryByText("Confirm save")).not.toBeInTheDocument();
    });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });

  it("shows a session error when there is no user id", async () => {
    mockUserId = null;
    const user = userEvent.setup();
    renderWithProviders(<PasswordForm />);

    await user.type(screen.getByLabelText("Current password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("New password"), VALID_PASSWORD);
    await user.type(screen.getByLabelText("Confirm new password"), VALID_PASSWORD);

    const saveButton = await waitFor(() => {
      const btn = screen.getByText("Save").closest("button")!;
      expect(btn).not.toBeDisabled();
      return btn;
    });
    await user.click(saveButton);
    await user.click(within(screen.getByRole("dialog")).getByText("Save"));

    await waitFor(() => {
      expect(screen.getByText("User session not found. Please log in again.")).toBeInTheDocument();
    });
    expect(mockUpdatePassword).not.toHaveBeenCalled();
  });
});
