import { screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

let mockRoles = [
  { id: 1, name: "Admin", description: "" },
  { id: 2, name: "Editor", description: "" },
];
let mockRolesLoading = false;
vi.mock("../../../../../application/hooks/useRoles", () => ({
  useRoles: () => ({ roles: mockRoles, loading: mockRolesLoading }),
}));

let mockUsers: any[] = [];
const mockRefreshUsers = vi.fn();
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers, loading: false, refreshUsers: mockRefreshUsers }),
}));

let mockInvitations: any[] = [];
const mockRefreshInvitations = vi.fn();
vi.mock("../../../../../application/hooks/useInvitations", () => ({
  default: () => ({
    invitations: mockInvitations,
    loading: false,
    refreshInvitations: mockRefreshInvitations,
  }),
}));

const mockDeleteUserById = vi.fn();
const mockUpdateUserById = vi.fn();
vi.mock("../../../../../application/repository/user.repository", () => ({
  deleteUserById: (...args: any[]) => mockDeleteUserById(...args),
  updateUserById: (...args: any[]) => mockUpdateUserById(...args),
}));

const mockRevokeInvitation = vi.fn();
const mockResendInvitation = vi.fn();
vi.mock("../../../../../application/repository/invitation.repository", () => ({
  revokeInvitation: (...args: any[]) => mockRevokeInvitation(...args),
  resendInvitation: (...args: any[]) => mockResendInvitation(...args),
}));

vi.mock("../../../../components/Modals/InviteUser", () => ({
  default: ({ isOpen, onSendInvite }: any) =>
    isOpen ? (
      <div data-testid="invite-user-modal">
        <button onClick={() => onSendInvite("new@user.com", 200)}>send-success</button>
        <button onClick={() => onSendInvite("new@user.com", 206, "http://fallback-link")}>
          send-fallback
        </button>
        <button onClick={() => onSendInvite("new@user.com", 500)}>send-error</button>
        <button
          onClick={() =>
            onSendInvite(
              "new@user.com",
              -1,
              undefined,
              "You cannot invite a user with more access than your own",
            )
          }
        >
          send-refused
        </button>
      </div>
    ) : null,
}));

import TeamManagement from "../index";

const buildUser = (overrides: Partial<any> = {}) => ({
  id: 2,
  name: "Jane",
  surname: "Doe",
  email: "jane@example.com",
  roleId: 2,
  ...overrides,
});

const buildInvitation = (overrides: Partial<any> = {}) => ({
  id: 1,
  email: "invitee@example.com",
  name: "Sam",
  surname: "Smith",
  role_id: 2,
  role_name: "Editor",
  status: "pending",
  invited_by: 1,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe("TeamManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRoles = [
      { id: 1, name: "Admin", description: "" },
      { id: 2, name: "Editor", description: "" },
    ];
    mockRolesLoading = false;
    mockUsers = [buildUser()];
    mockInvitations = [];
  });

  it("shows a loading label while roles are loading", () => {
    mockRolesLoading = true;
    renderWithProviders(<TeamManagement />);
    expect(screen.getByText("Loading roles...")).toBeInTheDocument();
  });

  it("renders team members in the table", () => {
    renderWithProviders(<TeamManagement />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
  });

  it("shows a dash row when there are no filtered members", () => {
    mockUsers = [];
    renderWithProviders(<TeamManagement />);
    const dashes = screen.getAllByText("-");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("filters members by role via the toggle buttons", async () => {
    mockUsers = [
      buildUser({ id: 2, name: "Jane", roleId: 2 }),
      buildUser({ id: 3, name: "Al", roleId: 1 }),
    ];
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Al Doe")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /^Admin/ }));
    await waitFor(() => {
      expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Al Doe")).toBeInTheDocument();
  });

  it("sorts by name when the column header is clicked", async () => {
    mockUsers = [
      buildUser({ id: 2, name: "Zed", roleId: 2 }),
      buildUser({ id: 3, name: "Amy", roleId: 2 }),
    ];
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);
    await user.click(screen.getAllByText("NAME")[0]);
    await waitFor(() => {
      const cells = screen.getAllByRole("cell");
      expect(cells[0].textContent).toContain("Amy");
    });
  });

  it("updates a member's role", async () => {
    mockUpdateUserById.mockResolvedValue({ status: 202 });
    renderWithProviders(<TeamManagement />);
    const roleSelects = screen.getAllByRole("combobox");
    fireEvent.mouseDown(roleSelects[0]);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Admin"));

    await waitFor(() => {
      expect(mockUpdateUserById).toHaveBeenCalledWith({
        userId: 2,
        userData: {
          name: "Jane",
          surname: "Doe",
          email: "jane@example.com",
          roleId: 1,
        },
      });
    });
  });

  it("shows an error alert when role update fails with a non-202 status", async () => {
    mockUpdateUserById.mockResolvedValue({ status: 400, data: { message: "Bad role" } });
    renderWithProviders(<TeamManagement />);
    const roleSelects = screen.getAllByRole("combobox");
    fireEvent.mouseDown(roleSelects[0]);
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Admin"));

    await waitFor(() => {
      expect(screen.getByText("Bad role")).toBeInTheDocument();
    });
  });

  it("deletes a member via the confirmation modal", async () => {
    mockDeleteUserById.mockResolvedValue({ status: 202 });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    const deleteButtons = screen.getAllByRole("button");
    const trashBtn = deleteButtons.find((btn) => btn.querySelector("svg.lucide-trash"));
    await user.click(trashBtn!);
    expect(await screen.findByText("Confirm delete")).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByText("Delete"));

    await waitFor(() => {
      expect(mockDeleteUserById).toHaveBeenCalledWith({ userId: 2 });
    });
    await waitFor(() => {
      expect(screen.getByText("User deleted successfully")).toBeInTheDocument();
    });
  });

  it("shows an info message when a demo user cannot be deleted", async () => {
    mockDeleteUserById.mockResolvedValue({ status: 403, data: { message: "Demo user" } });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    const deleteButtons = screen.getAllByRole("button");
    const trashBtn = deleteButtons.find((btn) => btn.querySelector("svg.lucide-trash"));
    await user.click(trashBtn!);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByText("Demo user")).toBeInTheDocument();
    });
  });

  it("renders pending invitations and their expiry status", () => {
    mockInvitations = [
      buildInvitation({ id: 1, email: "a@b.com" }),
      buildInvitation({ id: 2, email: "expired@b.com", expires_at: "2000-01-01T00:00:00Z" }),
    ];
    renderWithProviders(<TeamManagement />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows the no-pending-invitations message", () => {
    renderWithProviders(<TeamManagement />);
    expect(screen.getByText("No pending invitations")).toBeInTheDocument();
  });

  it.each([
    ["Resend invitation", mockResendInvitation],
    ["Revoke invitation", mockRevokeInvitation],
  ])("refreshes the list when %s is refused", async (title, mockAction) => {
    // A 409 means the invitation changed meanwhile; the list must show it.
    mockInvitations = [buildInvitation()];
    mockAction.mockRejectedValue(
      new Error("The invitation was changed by someone else. Try again."),
    );
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle(title));
    await waitFor(() => {
      expect(screen.getByText(/changed by someone else/)).toBeInTheDocument();
    });
    expect(mockRefreshInvitations).toHaveBeenCalled();
  });

  it("resends an invitation", async () => {
    mockInvitations = [buildInvitation()];
    mockResendInvitation.mockResolvedValue({ status: 200 });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Resend invitation"));
    await waitFor(() => {
      expect(mockResendInvitation).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Invitation resent successfully.")).toBeInTheDocument();
    });
  });

  it("shows the new link in a persistent modal when resend returns 206", async () => {
    // Resending replaces the invitee's link, so when the email fails the
    // admin must get the new one to share. A toast that auto-closes cannot
    // be copied from, so the link lives in a modal until dismissed.
    mockInvitations = [buildInvitation()];
    mockResendInvitation.mockResolvedValue({
      status: 206,
      data: { data: { error: "SMTP down", link: "http://new-link" } },
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Resend invitation"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Links sent earlier no longer work/)).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("http://new-link")).toBeInTheDocument();
  });

  it("keeps the resend fallback modal open past the toast timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockInvitations = [buildInvitation()];
      mockResendInvitation.mockResolvedValue({
        status: 206,
        data: { data: { link: "http://new-link" } },
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderWithProviders(<TeamManagement />);

      await user.click(screen.getByTitle("Resend invitation"));
      await screen.findByRole("dialog");
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.getByDisplayValue("http://new-link")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("copies the fallback link and shows a copied state", async () => {
    mockInvitations = [buildInvitation()];
    mockResendInvitation.mockResolvedValue({
      status: 206,
      data: { data: { link: "http://new-link" } },
    });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Resend invitation"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("http://new-link");
    expect(await within(dialog).findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("tells the admin to copy manually when the clipboard is unavailable", async () => {
    mockInvitations = [buildInvitation()];
    mockResendInvitation.mockResolvedValue({
      status: 206,
      data: { data: { link: "http://new-link" } },
    });
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Resend invitation"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Copy link" }));
    expect(await within(dialog).findByText(/Could not copy the link/)).toBeInTheDocument();
  });

  it("closes the fallback link modal with Done", async () => {
    mockInvitations = [buildInvitation()];
    mockResendInvitation.mockResolvedValue({
      status: 206,
      data: { data: { link: "http://new-link" } },
    });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Resend invitation"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("http://new-link")).not.toBeInTheDocument();
    });
  });

  it("keeps the generic message when resend returns 206 without a link", async () => {
    mockInvitations = [buildInvitation()];
    mockResendInvitation.mockResolvedValue({ status: 206, data: { data: {} } });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Resend invitation"));
    await waitFor(() => {
      expect(
        screen.getByText("Email service unavailable. A fallback link was generated."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("revokes an invitation", async () => {
    mockInvitations = [buildInvitation()];
    mockRevokeInvitation.mockResolvedValue({ status: 200 });
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByTitle("Revoke invitation"));
    await waitFor(() => {
      expect(mockRevokeInvitation).toHaveBeenCalledWith(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Invitation revoked.")).toBeInTheDocument();
    });
  });

  it("opens the invite modal and handles a successful invite", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByText("Invite team member"));
    expect(screen.getByTestId("invite-user-modal")).toBeInTheDocument();

    await user.click(screen.getByText("send-success"));
    await waitFor(() => {
      expect(screen.getByText(/Invitation sent to new@user.com/)).toBeInTheDocument();
    });
    expect(mockRefreshInvitations).toHaveBeenCalled();
  });

  it("shows the fallback link in a modal for a 206 invite response", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByText("Invite team member"));
    await user.click(screen.getByText("send-fallback"));
    const dialog = await screen.findByRole("dialog");
    // A fixed sentence, so it can be translated.
    expect(
      within(dialog).getByText(/The invitation was created, but the email could not be sent/),
    ).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("http://fallback-link")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Links sent earlier no longer work/)).not.toBeInTheDocument();
  });

  it("shows an error message when invite fails", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByText("Invite team member"));
    await user.click(screen.getByText("send-error"));
    await waitFor(() => {
      expect(screen.getByText(/Failed to send invitation to new@user.com/)).toBeInTheDocument();
    });
  });

  it("shows the server's reason when an invite is refused", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamManagement />);

    await user.click(screen.getByText("Invite team member"));
    await user.click(screen.getByText("send-refused"));
    await waitFor(() => {
      expect(
        screen.getByText(/You cannot invite a user with more access than your own/),
      ).toBeInTheDocument();
    });
  });
});
