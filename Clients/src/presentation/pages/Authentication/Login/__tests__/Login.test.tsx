import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { queryClient } from "../../../../../application/config/queryClient";
import Login from "../index";

const mockLoginUser = vi.fn();
const mockSelectLoginOrganization = vi.fn();
vi.mock("../../../../../application/repository/user.repository", async () => {
  const actual = await vi.importActual("../../../../../application/repository/user.repository");
  return {
    ...actual,
    loginUser: (...args: unknown[]) => mockLoginUser(...args),
    selectLoginOrganization: (...args: unknown[]) => mockSelectLoginOrganization(...args),
  };
});

// Mock the SVG import used by Login
vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
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

  it("starts the session with an empty query cache", async () => {
    // Data cached in this tab before (an earlier session that was never
    // logged out) must not show for the user who signs in now.
    queryClient.setQueryData(["projects"], [{ id: 1, name: "Previous user's project" }]);
    mockLoginUser.mockResolvedValue({
      status: 202,
      data: { data: { token: "new-token", onboarding_status: "completed" } },
    });
    const user = userEvent.setup();
    const { store } = renderWithProviders(<Login />, { route: "/login" });

    await user.type(screen.getByPlaceholderText("name.surname@companyname.com"), "a@b.com");
    await user.type(screen.getByPlaceholderText("Enter your password"), "Password#1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    expect(store.getState().auth.authToken).toBe("new-token");
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });

  describe("a user in several organizations", () => {
    const selection = {
      status: 202,
      data: {
        data: {
          requiresOrganizationSelection: true,
          organizations: [
            { id: 4, name: "Acme", role_name: "Admin" },
            { id: 7, name: "Globex", role_name: "Editor" },
          ],
          selectionToken: "selection-token",
        },
      },
    };

    const signIn = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByPlaceholderText("name.surname@companyname.com"), "a@b.com");
      await user.type(screen.getByPlaceholderText("Enter your password"), "Password#1");
      await user.click(screen.getByRole("button", { name: /sign in/i }));
    };

    beforeEach(() => {
      mockLoginUser.mockReset();
      mockSelectLoginOrganization.mockReset();
      mockLoginUser.mockResolvedValue(selection);
    });

    it("asks for an organization instead of starting a session", async () => {
      const user = userEvent.setup();
      const { store } = renderWithProviders(<Login />, { route: "/login" });

      await signIn(user);

      expect(await screen.findByText("Choose an organization")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
      expect(store.getState().auth.authToken).toBeFalsy();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("starts the session for the chosen organization", async () => {
      mockSelectLoginOrganization.mockResolvedValue({
        status: 202,
        data: { data: { token: "globex-token", onboarding_status: "completed" } },
      });
      const user = userEvent.setup();
      const { store } = renderWithProviders(<Login />, { route: "/login" });

      await signIn(user);
      await user.click(await screen.findByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Globex (Editor)" }));
      await user.click(screen.getByRole("button", { name: /continue/i }));

      expect(mockSelectLoginOrganization).toHaveBeenCalledWith({
        selectionToken: "selection-token",
        organizationId: 7,
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
      expect(store.getState().auth.authToken).toBe("globex-token");
    });

    it("goes back to sign in when the selection has expired", async () => {
      mockSelectLoginOrganization.mockRejectedValue({ status: 406, message: "Token expired" });
      const user = userEvent.setup();
      renderWithProviders(<Login />, { route: "/login" });

      await signIn(user);
      await user.click(await screen.findByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: "Acme (Admin)" }));
      await user.click(screen.getByRole("button", { name: /continue/i }));

      expect(
        await screen.findByText("Your sign-in expired. Please sign in again."),
      ).toBeInTheDocument();
      expect(screen.getByText("Log in to your account")).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
