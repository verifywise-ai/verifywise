import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CommandPalette } from "../index";

// Mock hooks
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({
    userRoleName: "Admin",
  }),
}));

const mockSetQuery = vi.fn();
const mockAddToRecent = vi.fn();
const mockRemoveFromRecent = vi.fn();
const mockSetReviewStatus = vi.fn();

vi.mock("../../../../application/hooks/useWiseSearch", () => ({
  useWiseSearch: () => ({
    query: "",
    setQuery: mockSetQuery,
    results: {},
    flatResults: [],
    isLoading: false,
    recentSearches: mockRecentSearches,
    addToRecent: mockAddToRecent,
    removeFromRecent: mockRemoveFromRecent,
    isSearchMode: false,
    reviewStatus: "",
    setReviewStatus: mockSetReviewStatus,
  }),
  getEntityDisplayName: (type: string) => type,
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

vi.mock("../../../../application/commands/actionHandler", () => {
  return {
    default: class {
      execute = vi.fn();
    },
    CommandActionHandlers: {},
  };
});

// Mock react-router
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: "/", search: "", hash: "", state: null, key: "default" }),
  };
});

// Mock CSS import
vi.mock("../styles.css", () => ({}));

let mockRecentSearches: any[] = [];

describe("CommandPalette", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRecentSearches = [];
    // Suppress MUI "Missing Description" aria warning for Dialog
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render dialog when open=true", () => {
    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    // The dialog should be in the DOM
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("should not render when open=false", () => {
    renderWithProviders(
      <CommandPalette open={false} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render search input field", () => {
    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("should show command groups when no search query", () => {
    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByText("Go to Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Go to Risk Management")).toBeInTheDocument();
  });

  it("should show navigation group heading", () => {
    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByText("Navigation")).toBeInTheDocument();
  });

  it("should render footer with keyboard hints", () => {
    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByText("Navigate")).toBeInTheDocument();
    expect(screen.getByText("Select")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("should render recent searches from localStorage", () => {
    mockRecentSearches = [
      { query: "vendor policy", timestamp: 1708000000000 },
    ];

    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByText("vendor policy")).toBeInTheDocument();
    expect(screen.getByText("Recent searches")).toBeInTheDocument();
  });

  it("should render evidence status filter", () => {
    renderWithProviders(
      <CommandPalette open={true} onOpenChange={mockOnOpenChange} />
    );

    expect(screen.getByText("Evidence Status:")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by review status")).toBeInTheDocument();
  });
});
