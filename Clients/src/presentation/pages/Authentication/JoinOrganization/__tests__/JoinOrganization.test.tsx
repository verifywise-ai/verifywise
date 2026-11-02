import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import JoinOrganization from "../index";

const mockAcceptInvitation = vi.fn();
vi.mock("../../../../../application/repository/user.repository", async () => {
  const actual = await vi.importActual("../../../../../application/repository/user.repository");
  return { ...actual, acceptInvitation: (...args: unknown[]) => mockAcceptInvitation(...args) };
});

vi.mock("../../../../assets/imgs/background-grid.svg", () => ({
  ReactComponent: () => <svg data-testid="bg-svg" />,
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

// Only the payload is read client-side.
const inviteToken = (expire: number) =>
  `header.${btoa(
    JSON.stringify({ email: "priya@x.io", roleId: 3, organizationId: 4, expire }),
  )}.signature`;

describe("Join organization page", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockAcceptInvitation.mockReset();
  });

  it("shows the invited email, read-only", () => {
    renderWithProviders(<JoinOrganization />, {
      route: `/join?token=${inviteToken(Date.now() + 60_000)}`,
    });

    expect(screen.getByText("Join an organization")).toBeInTheDocument();
    expect(screen.getByDisplayValue("priya@x.io")).toBeDisabled();
    expect(screen.getByRole("button", { name: /join organization/i })).toBeDisabled();
  });

  it("joins with the account's password and starts the session", async () => {
    const token = inviteToken(Date.now() + 60_000);
    mockAcceptInvitation.mockResolvedValue({
      status: 202,
      data: { data: { token: "acme-token", onboarding_status: "completed" } },
    });
    const user = userEvent.setup();
    const { store } = renderWithProviders(<JoinOrganization />, {
      route: `/join?token=${token}`,
    });

    await user.type(screen.getByPlaceholderText("Enter your password"), "Password#1");
    await user.click(screen.getByRole("button", { name: /join organization/i }));

    expect(mockAcceptInvitation).toHaveBeenCalledWith({
      inviteToken: token,
      body: { email: "priya@x.io", password: "Password#1", roleId: 3, organizationId: 4 },
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/"));
    expect(store.getState().auth.authToken).toBe("acme-token");
  });

  it("shows the server's refusal", async () => {
    mockAcceptInvitation.mockRejectedValue(
      new Error("User is already a member of this organization"),
    );
    const user = userEvent.setup();
    renderWithProviders(<JoinOrganization />, {
      route: `/join?token=${inviteToken(Date.now() + 60_000)}`,
    });

    await user.type(screen.getByPlaceholderText("Enter your password"), "Password#1");
    await user.click(screen.getByRole("button", { name: /join organization/i }));

    expect(
      await screen.findByText("User is already a member of this organization"),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("refuses an expired link", () => {
    renderWithProviders(<JoinOrganization />, {
      route: `/join?token=${inviteToken(Date.now() - 60_000)}`,
    });

    expect(screen.getByText(/This invitation link is expired/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter your password")).toBeDisabled();
  });
});
