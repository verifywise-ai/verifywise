import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: undefined, isLoading: true, error: null }),
}));
vi.mock("../../../../../application/hooks/useCan", () => {
  const useCan = () => true;
  return {
    useCan,
    useCanCheck: () => useCan,
    usePermissionsSettled: () => true,
  };
});

const mockUsers: { id: number; name: string; surname: string; email: string }[] = [];
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers, loading: false, error: null, refreshUsers: vi.fn() }),
}));

const mockMutateAsync = vi.fn();
const mockUpdateAsync = vi.fn();
const mockSetMembersAsync = vi.fn();
vi.mock("../../../../../application/hooks/useGroups", () => ({
  useGroups: vi.fn(),
  useGroupMembers: vi.fn(),
  useCreateGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useUpdateGroup: () => ({ mutateAsync: mockUpdateAsync, isPending: false }),
  useDeleteGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useSetGroupMembers: () => ({ mutateAsync: mockSetMembersAsync, isPending: false }),
}));

import GroupsPage from "../index";
import { useGroupMembers, useGroups } from "../../../../../application/hooks/useGroups";

const mockUseGroups = useGroups as unknown as ReturnType<typeof vi.fn>;
const mockUseGroupMembers = useGroupMembers as unknown as ReturnType<typeof vi.fn>;

const loadedMembers = {
  data: [
    { user_id: 11, name: "Ada", surname: "Lovelace", email: "ada@example.com" },
    { user_id: 12, name: "Alan", surname: "Turing", email: "alan@example.com" },
  ],
  isLoading: false,
  isError: false,
};

const sampleGroups = [
  {
    id: 1,
    organization_id: 7,
    name: "Model risk team",
    description: "Reviews models",
    created_by: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    member_count: 3,
  },
];

describe("GroupsPage (#5253)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGroups.mockReturnValue({ data: sampleGroups, isLoading: false, isError: false });
    mockUseGroupMembers.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mockUpdateAsync.mockResolvedValue({});
    mockSetMembersAsync.mockResolvedValue(undefined);
    mockUsers.length = 0;
  });

  it("renders the groups with their member counts", async () => {
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    await waitFor(() => {
      expect(screen.getByText("Model risk team")).toBeInTheDocument();
    });
    expect(screen.getByText("Reviews models")).toBeInTheDocument();
  });

  it("shows an empty state when there are no groups", async () => {
    mockUseGroups.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    await waitFor(() => {
      expect(screen.getByText(/No groups yet/i)).toBeInTheDocument();
    });
  });

  it("creates a group from the modal", async () => {
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Model risk team"), {
      target: { value: "Compliance team" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        name: "Compliance team",
        description: null,
      });
    });
  });

  it("editing only the name keeps the group's members", async () => {
    mockUseGroupMembers.mockImplementation((id: number | null) =>
      id === 1 ? loadedMembers : { data: undefined, isLoading: false, isError: false },
    );
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    fireEvent.click(screen.getByRole("button", { name: /edit model risk team/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Model risk team"), {
      target: { value: "Model risk office" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => {
      expect(mockUpdateAsync).toHaveBeenCalledWith({
        id: 1,
        body: { name: "Model risk office", description: "Reviews models" },
      });
    });
    expect(mockSetMembersAsync).not.toHaveBeenCalled();
  });

  it("does not replace members while they are still loading", async () => {
    mockUseGroupMembers.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    fireEvent.click(screen.getByRole("button", { name: /edit model risk team/i }));
    expect(screen.getByText("Loading members...")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());
    expect(mockSetMembersAsync).not.toHaveBeenCalled();
  });

  it("retries only the members when they fail to save after a create", async () => {
    mockUsers.push({ id: 11, name: "Ada", surname: "Lovelace", email: "ada@example.com" });
    mockMutateAsync.mockResolvedValueOnce({ ...sampleGroups[0], id: 2, name: "Compliance team" });
    mockSetMembersAsync.mockRejectedValueOnce({
      response: { data: { message: "Members service unavailable" } },
    });
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));
    fireEvent.change(screen.getByPlaceholderText("e.g. Model risk team"), {
      target: { value: "Compliance team" },
    });
    const membersInput = screen.getByPlaceholderText("Select members");
    fireEvent.mouseDown(membersInput);
    fireEvent.click(await screen.findByText("Ada Lovelace"));
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/members were not saved/i)).toBeInTheDocument();
    expect(screen.getByText("Members service unavailable")).toBeInTheDocument();
    expect(screen.getByText("Edit group")).toBeInTheDocument();
    expect(mockSetMembersAsync).toHaveBeenCalledWith({ id: 2, userIds: [11] });

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockSetMembersAsync).toHaveBeenCalledTimes(2));
    expect(mockSetMembersAsync).toHaveBeenLastCalledWith({ id: 2, userIds: [11] });
    // The group was POSTed once; the retry updated it instead of re-creating.
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateAsync).toHaveBeenCalledWith({
      id: 2,
      body: { name: "Compliance team", description: null },
    });
  });

  it("shows a failed delete inside the confirm dialog and keeps it open", async () => {
    mockMutateAsync.mockRejectedValueOnce({
      response: { data: { message: "Group is still in use" } },
    });
    renderWithProviders(<GroupsPage />, { route: "/groups" });
    fireEvent.click(screen.getByRole("button", { name: /delete model risk team/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText("Group is still in use")).toBeInTheDocument();
    expect(screen.getByText("Delete this group?")).toBeInTheDocument();

    // Cancelling clears it, so it never leaks into the next modal.
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByText("Delete this group?")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));
    expect(screen.queryByText("Group is still in use")).not.toBeInTheDocument();
  });
});
