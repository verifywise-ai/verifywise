import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PolicyManagerModel } from "../../../../domain/models/Common/policy/policyManager.model";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

let mockUserRoleName = "Admin";
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

let mockUsers: any[] = [];
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: mockUsers, loading: false, error: null, refreshUsers: vi.fn() }),
}));

let mockPolicies: PolicyManagerModel[] = [];
let mockPoliciesLoading = false;
vi.mock("../../../../application/hooks/usePolicies", () => ({
  usePolicies: () => ({ data: mockPolicies, isLoading: mockPoliciesLoading }),
  policyQueryKeys: {
    all: ["policies"],
    lists: () => ["policies", "list"],
    list: (filters: Record<string, unknown> = {}) => ["policies", "list", filters],
  },
}));

const mockDeletePolicy = vi.fn();
vi.mock("../../../../application/repository/policy.repository", () => ({
  deletePolicy: (...args: any[]) => mockDeletePolicy(...args),
}));

const mockGetPolicyFolders = vi.fn();
const mockGetPolicyIdsInFolder = vi.fn();
const mockUpdatePolicyFolders = vi.fn();
vi.mock("../../../../application/repository/policyFolder.repository", () => ({
  getPolicyFolders: (...args: any[]) => mockGetPolicyFolders(...args),
  getPolicyIdsInFolder: (...args: any[]) => mockGetPolicyIdsInFolder(...args),
  updatePolicyFolders: (...args: any[]) => mockUpdatePolicyFolders(...args),
}));

const mockHandleCreateFolder = vi.fn();
const mockRefreshFolders = vi.fn();
vi.mock("../../../../application/hooks/useVirtualFolders", () => ({
  useVirtualFolders: () => ({
    folderTree: [],
    selectedFolder: "all",
    setSelectedFolder: vi.fn(),
    loading: false,
    handleCreateFolder: mockHandleCreateFolder,
    refreshFolders: mockRefreshFolders,
  }),
}));

vi.mock("../../../components/Policies/PolicyTable", () => ({
  default: ({ data, onOpen, onDelete, onLinkedObjects, onAssignToFolder, onBulkActionSuccess }: any) => (
    <div data-testid="policy-table">
      <span data-testid="policy-row-count">{data.length}</span>
      {data.map((p: any) => (
        <div key={p.id}>{p.title}</div>
      ))}
      <button data-testid="open-first" onClick={() => data[0] && onOpen(data[0].id)}>
        open
      </button>
      <button data-testid="add-new" onClick={() => onOpen()}>
        add new
      </button>
      <button data-testid="delete-first" onClick={() => data[0] && onDelete(data[0].id)}>
        delete
      </button>
      <button
        data-testid="linked-first"
        onClick={() => data[0] && onLinkedObjects(data[0].id)}
      >
        linked
      </button>
      <button
        data-testid="assign-folder-first"
        onClick={() => data[0] && onAssignToFolder?.(data[0].id)}
      >
        assign folder
      </button>
      <button
        data-testid="bulk-archive"
        onClick={() => onBulkActionSuccess?.("archive", 2)}
      >
        bulk archive
      </button>
    </div>
  ),
}));

vi.mock("../../../components/Table/ExportMenu", () => ({
  ExportMenu: () => <div data-testid="export-menu" />,
}));

vi.mock("../../FileManager/components/FolderTree", () => ({
  FolderTree: () => <div data-testid="folder-tree" />,
}));

vi.mock("../../FileManager/components/CreateFolderModal", () => ({
  CreateFolderModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="create-folder-modal" /> : null,
}));

vi.mock("../../FileManager/components/AssignToFolderModal", () => ({
  AssignToFolderModal: ({ isOpen }: any) =>
    isOpen ? <div data-testid="assign-folder-modal" /> : null,
}));

vi.mock("../../../components/Policies/LinkedPolicyModal", () => ({
  default: ({ isOpen }: any) => (isOpen ? <div data-testid="linked-policy-modal" /> : null),
}));

import PolicyManager from "../PolicyManager";

function buildPolicy(overrides: Partial<PolicyManagerModel> = {}): PolicyManagerModel {
  return {
    id: 1,
    title: "AI Ethics Policy",
    content_html: "<p>content</p>",
    status: "Draft",
    tags: [],
    next_review_date: new Date("2025-12-01"),
    author_id: 1,
    last_updated_by: 1,
    last_updated_at: new Date("2025-01-01"),
    created_at: new Date("2025-01-01"),
    ...overrides,
  } as PolicyManagerModel;
}

describe("PolicyManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockUsers = [
      { id: 1, name: "Jane", surname: "Doe", email: "jane@test.com" },
    ];
    mockPolicies = [
      buildPolicy({ id: 1, title: "AI Ethics Policy", status: "Draft" }),
      buildPolicy({ id: 2, title: "Data Governance Policy", status: "Approved" }),
    ];
    mockPoliciesLoading = false;
    mockGetPolicyFolders.mockResolvedValue([]);
    mockGetPolicyIdsInFolder.mockResolvedValue([]);
    mockUpdatePolicyFolders.mockResolvedValue(undefined);
  });

  it("renders the status cards and the policy table with data", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByTestId("policy-table")).toBeInTheDocument();
    expect(screen.getByTestId("policy-row-count").textContent).toBe("2");
  });

  it("shows a loading skeleton while policies are loading", () => {
    mockPoliciesLoading = true;
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    expect(screen.queryByTestId("policy-table")).not.toBeInTheDocument();
  });

  it("shows an empty state when there are no policies", () => {
    mockPolicies = [];
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    expect(
      screen.getByText(/No policies yet\. Policies define the rules/),
    ).toBeInTheDocument();
  });

  it("navigates to the new policy editor when 'Add new policy' is clicked", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByText("Add new policy"));
    expect(mockNavigate).toHaveBeenCalledWith("/policies/new");
  });

  it("navigates to the policy editor when a row's open action fires", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByTestId("open-first"));
    expect(mockNavigate).toHaveBeenCalledWith("/policies/1/edit");
  });

  it("filters policies by status when a status card is clicked", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByText("Approved"));
    expect(screen.getByTestId("policy-row-count").textContent).toBe("1");
    expect(screen.getByText("Data Governance Policy")).toBeInTheDocument();
  });

  it("clears the status filter when the same status card is clicked again", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByText("Approved"));
    expect(screen.getByTestId("policy-row-count").textContent).toBe("1");
    fireEvent.click(screen.getByText("Approved"));
    expect(screen.getByTestId("policy-row-count").textContent).toBe("2");
  });

  it("filters policies by search term", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    const searchInput = screen.getByLabelText("Search policies");
    fireEvent.change(searchInput, { target: { value: "governance" } });
    expect(screen.getByTestId("policy-row-count").textContent).toBe("1");
    expect(screen.getByText("Data Governance Policy")).toBeInTheDocument();
  });

  it("deletes a policy and shows a success alert", async () => {
    mockDeletePolicy.mockResolvedValue(undefined);
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByTestId("delete-first"));
    await waitFor(() => expect(mockDeletePolicy).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.getByText("Policy deleted successfully!")).toBeInTheDocument(),
    );
  });

  it("shows an error alert when policy deletion fails", async () => {
    mockDeletePolicy.mockRejectedValue(new Error("failed"));
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByTestId("delete-first"));
    await waitFor(() =>
      expect(screen.getByText("Failed to delete policy. Please try again.")).toBeInTheDocument(),
    );
  });

  it("opens the linked objects modal for a policy", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByTestId("linked-first"));
    expect(screen.getByTestId("linked-policy-modal")).toBeInTheDocument();
  });

  it("opens the assign-to-folder modal for a policy", async () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByTestId("assign-folder-first"));
    await waitFor(() => expect(mockGetPolicyFolders).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(screen.getByTestId("assign-folder-modal")).toBeInTheDocument(),
    );
  });

  it("shows a bulk action success alert", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    fireEvent.click(screen.getByTestId("bulk-archive"));
    expect(screen.getByText("2 policies archived")).toBeInTheDocument();
  });

  it("toggles the folder sidebar open and closed", () => {
    renderWithProviders(<PolicyManager tags={[]} />, { route: "/policies" });
    expect(screen.queryByTestId("folder-tree")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Documents"));
    expect(screen.getByTestId("folder-tree")).toBeInTheDocument();
  });
});
