import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false, error: null, refreshUsers: vi.fn() }),
}));

const mockMutateAsync = vi.fn();
const mockUpdateAsync = vi.fn();
const mockSetMembersAsync = vi.fn();
vi.mock("../../../../application/hooks/useGroups", () => ({
  useGroups: vi.fn(),
  useGroupMembers: vi.fn(),
  useCreateGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useUpdateGroup: () => ({ mutateAsync: mockUpdateAsync, isPending: false }),
  useDeleteGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useSetGroupMembers: () => ({ mutateAsync: mockSetMembersAsync, isPending: false }),
}));

import GroupsPage from "../index";
import { useGroupMembers, useGroups } from "../../../../application/hooks/useGroups";

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
});
