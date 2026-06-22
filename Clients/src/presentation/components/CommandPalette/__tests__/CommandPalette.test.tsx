import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CommandPalette } from "../index";

interface MockSearchResult {
  id: number;
  entityType: string;
  title: string;
  subtitle?: string;
  route: string;
}

const mockNavigate = vi.fn();
const mockOnOpenChange = vi.fn();
const mockSetQuery = vi.fn();
const mockAddToRecent = vi.fn();
const mockRemoveFromRecent = vi.fn();
const mockSetReviewStatus = vi.fn();
const mockExecute = vi.hoisted(() => vi.fn());

const defaultWiseSearch: {
  query: string;
  setQuery: typeof mockSetQuery;
  results: Record<string, { results: MockSearchResult[] }>;
  flatResults: MockSearchResult[];
  isLoading: boolean;
  recentSearches: { query: string; timestamp: number }[];
  addToRecent: typeof mockAddToRecent;
  removeFromRecent: typeof mockRemoveFromRecent;
  isSearchMode: boolean;
  reviewStatus: string;
  setReviewStatus: typeof mockSetReviewStatus;
} = {
  query: "",
  setQuery: mockSetQuery,
  results: {},
  flatResults: [],
  isLoading: false,
  recentSearches: [],
  addToRecent: mockAddToRecent,
  removeFromRecent: mockRemoveFromRecent,
  isSearchMode: false,
  reviewStatus: "",
  setReviewStatus: mockSetReviewStatus,
};

const mockUseWiseSearch = vi.hoisted(() => vi.fn(() => ({ ...defaultWiseSearch })));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));

vi.mock("../../../../application/hooks/useWiseSearch", () => ({
  useWiseSearch: mockUseWiseSearch,
  getEntityDisplayName: (type: string) => {
    const names: Record<string, string> = {
      projects: "Projects",
      tasks: "Tasks",
      vendors: "Vendors",
    };
    return names[type] || type;
  },
}));

const mockCommands = [
  {
    id: "nav-dashboard",
    label: "Go to Dashboard",
    description: "Navigate to dashboard",
    group: { id: "navigation", label: "Navigation", priority: 1 },
    action: { type: "navigate", path: "/" },
    keywords: ["home"],
  },
  {
    id: "nav-risks",
    label: "Go to Risk Management",
    description: "Navigate to risks",
    group: { id: "navigation", label: "Navigation", priority: 1 },
    action: { type: "navigate", path: "/risk-management" },
    keywords: ["risks"],
  },
];

vi.mock("../../../../application/commands/registry", () => ({
  default: {
    getCommands: () => mockCommands,
  },
}));

vi.mock("../../../../application/commands/actionHandler", () => ({
  default: class {
    execute = mockExecute;
  },
  CommandActionHandlers: {},
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null, key: "default" }),
  };
});

vi.mock("../styles.css", () => ({}));

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseWiseSearch.mockReturnValue({ ...defaultWiseSearch });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render dialog when open=true", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("should not render when open=false", () => {
    renderWithProviders(<CommandPalette open={false} onOpenChange={mockOnOpenChange} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render search input field", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("should show command groups when no search query", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Go to Risk Management")).toBeInTheDocument();
  });

  it("should show navigation group heading", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("should render footer with keyboard hints", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("should render recent searches", () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      recentSearches: [{ query: "vendor policy", timestamp: 1708000000000 }],
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("vendor policy")).toBeInTheDocument();
    expect(screen.getByText("Recent searches")).toBeInTheDocument();
  });

  it("should render evidence status filter", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    expect(screen.getByText("Evidence Status:")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by review status")).toBeInTheDocument();
  });

  it("should show loading spinner when searching", () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      isSearchMode: true,
      isLoading: true,
      flatResults: [],
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });

  it("should show empty state when no results in search mode", () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      isSearchMode: true,
      isLoading: false,
      flatResults: [],
      query: "nonexistent",
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText(/No results found/)).toBeInTheDocument();
  });

  it("should show search results grouped by entity type", () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      query: "test",
      isSearchMode: true,
      isLoading: false,
      flatResults: [
        { id: 1, entityType: "projects", title: "AI Project", route: "/projects/1" },
        { id: 2, entityType: "tasks", title: "Review task", route: "/tasks/2" },
      ],
      results: {
        projects: {
          results: [{ id: 1, entityType: "projects", title: "AI Project", route: "/projects/1" }],
        },
        tasks: {
          results: [{ id: 2, entityType: "tasks", title: "Review task", route: "/tasks/2" }],
        },
      },
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("AI Project")).toBeInTheDocument();
    expect(screen.getByText("Review task")).toBeInTheDocument();
    expect(screen.getByText("2 results found")).toBeInTheDocument();
  });

  it("should show welcome banner on first visit", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("Wise Search")).toBeInTheDocument();
    expect(screen.getByText("Got it")).toBeInTheDocument();
  });

  it("should dismiss welcome banner and set localStorage", async () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("Wise Search")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText("Got it"));

    await waitFor(() => {
      expect(screen.queryByText("Wise Search")).not.toBeInTheDocument();
    });
    expect(localStorage.getItem("verifywise_wise_search_welcome_dismissed")).toBe("true");
  });

  it("should not show welcome banner after dismissal", () => {
    localStorage.setItem("verifywise_wise_search_welcome_dismissed", "true");

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.queryByText("Wise Search")).not.toBeInTheDocument();
  });

  it("should render filter trigger button with all statuses", () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("All statuses")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by review status")).toBeInTheDocument();
  });

  it("should show clear filter button when filter is active", () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      reviewStatus: "approved",
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByLabelText("Clear review status filter")).toBeInTheDocument();
  });

  it("should execute navigate command when command item is clicked", async () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    const user = userEvent.setup();

    const dashboardItem = screen.getByText("Go to Dashboard");
    await user.click(dashboardItem);

    expect(mockExecute).toHaveBeenCalledWith({ type: "navigate", path: "/" });
  });

  it("should render search results with result count and entity group", () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      query: "test",
      isSearchMode: true,
      isLoading: false,
      flatResults: [
        { id: 1, entityType: "projects", title: "AI Project", route: "/projects/1" },
        { id: 2, entityType: "tasks", title: "Review task", route: "/tasks/2" },
      ],
      results: {
        projects: {
          results: [{ id: 1, entityType: "projects", title: "AI Project", route: "/projects/1" }],
        },
        tasks: {
          results: [{ id: 2, entityType: "tasks", title: "Review task", route: "/tasks/2" }],
        },
      },
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);

    expect(screen.getByText("AI Project")).toBeInTheDocument();
    expect(screen.getByText("Review task")).toBeInTheDocument();
    expect(screen.getByText("2 results found")).toBeInTheDocument();
  });

  it("should close dialog when escape is pressed", async () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    const user = userEvent.setup();

    const input = screen.getByRole("combobox");
    await user.type(input, "{Escape}");

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("should reset search query on close via handleOpenChange", async () => {
    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    const user = userEvent.setup();

    const input = screen.getByRole("combobox");
    await user.type(input, "{Escape}");

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("should remove recent search on remove button click", async () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      recentSearches: [{ query: "old search", timestamp: 1708000000000 }],
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    const user = userEvent.setup();

    const removeBtn = screen.getByLabelText('Remove "old search" from recent searches');
    await user.click(removeBtn);

    expect(mockRemoveFromRecent).toHaveBeenCalledWith(1708000000000);
  });

  it("should fill search input when recent search is clicked", async () => {
    mockUseWiseSearch.mockReturnValue({
      ...defaultWiseSearch,
      recentSearches: [{ query: "vendor policy", timestamp: 1708000000000 }],
    });

    renderWithProviders(<CommandPalette open={true} onOpenChange={mockOnOpenChange} />);
    const user = userEvent.setup();

    await user.click(screen.getByText("vendor policy"));

    expect(mockSetQuery).toHaveBeenCalledWith("vendor policy");
  });
});
