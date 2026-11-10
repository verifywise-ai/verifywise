import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useHasPermission: () => true,
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [], loading: false, error: null, refreshUsers: vi.fn() }),
}));

const mockMutateAsync = vi.fn();
vi.mock("../../../../application/hooks/useGroups", () => ({
  useGroups: vi.fn(),
  useCreateGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useUpdateGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useDeleteGroup: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useSetGroupMembers: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

import GroupsPage from "../index";
import { useGroups } from "../../../../application/hooks/useGroups";

const mockUseGroups = useGroups as unknown as ReturnType<typeof vi.fn>;

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
});
