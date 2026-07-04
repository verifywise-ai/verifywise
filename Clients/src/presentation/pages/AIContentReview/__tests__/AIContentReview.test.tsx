import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockStats = vi.fn();
const mockUnreviewed = vi.fn();
const mockReview = vi.fn();

vi.mock("../../../../application/hooks/useAIContent", () => ({
  useAIContentStats: (...args: any[]) => mockStats(...args),
  useUnreviewedContent: (...args: any[]) => mockUnreviewed(...args),
  useReviewContent: (...args: any[]) => mockReview(...args),
}));

vi.mock("../../../components/VisibilityToggle", () => ({
  VisibilityChips: () => <div data-testid="visibility-chips" />,
}));

vi.mock("../../../components/AIContentReviewPanel", () => ({
  default: ({ item }: any) => <div data-testid="review-panel">{item.content}</div>,
}));

vi.mock("../../../components/Chip", () => ({
  default: ({ label }: any) => <span data-testid="chip">{label}</span>,
}));

import AIContentReview from "../index";

const defaultStats = {
  data: {
    total: 42,
    reviewed: 10,
    unreviewed: 32,
    review_rate: 23.8,
    avg_confidence: 87,
    by_badge_type: {
      generated: 20,
      assisted: 15,
      reviewed: 5,
      suggested: 2,
    },
  },
  isLoading: false,
};

const defaultUnreviewed = {
  data: {
    items: [
      { id: 1, content: "Item 1 content" },
      { id: 2, content: "Item 2 content" },
    ],
    total: 2,
  },
  isLoading: false,
};

const defaultReview = {
  mutate: vi.fn(),
  isPending: false,
};

describe("AIContentReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStats.mockReturnValue(defaultStats);
    mockUnreviewed.mockReturnValue(defaultUnreviewed);
    mockReview.mockReturnValue(defaultReview);
  });

  it("renders the page title and description", () => {
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("AI content review")).toBeInTheDocument();
    expect(screen.getByText(/Review and approve AI-generated content/)).toBeInTheDocument();
    expect(screen.getByTestId("visibility-chips")).toBeInTheDocument();
  });

  it("renders stat cards with data", () => {
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("23.8%")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
  });

  it("shows loading spinner for stats when loading", () => {
    mockStats.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<AIContentReview />);
    expect(document.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("shows loading spinner for unreviewed content when loading", () => {
    mockUnreviewed.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: true,
    });
    renderWithProviders(<AIContentReview />);
    const spinners = document.querySelectorAll(".MuiCircularProgress-root");
    expect(spinners.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'All caught up!' empty state when no items", () => {
    mockUnreviewed.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    });
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("All caught up!")).toBeInTheDocument();
    expect(screen.getByText("No AI-generated content pending review.")).toBeInTheDocument();
  });

  it("renders review panels for each unreviewed item", () => {
    renderWithProviders(<AIContentReview />);
    const panels = screen.getAllByTestId("review-panel");
    expect(panels).toHaveLength(2);
    expect(screen.getByText("Item 1 content")).toBeInTheDocument();
    expect(screen.getByText("Item 2 content")).toBeInTheDocument();
  });

  it("shows review progress bar with stats", () => {
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("Review progress")).toBeInTheDocument();
    expect(screen.getByText("10/42")).toBeInTheDocument();
  });

  it("renders by-type breakdown for badge types with data", () => {
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.getByText("AI-assisted")).toBeInTheDocument();
    expect(screen.getByText("AI-suggested")).toBeInTheDocument();
  });

  it("switches to All AI content tab", async () => {
    renderWithProviders(<AIContentReview />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    await userEvent.click(tabs[1]);
    await waitFor(() => {
      expect(screen.getByText(/Full AI content history/)).toBeInTheDocument();
    });
  });

  it("shows pending count chip in tab when total > 0", () => {
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("does not render by-type badges with zero count", () => {
    mockStats.mockReturnValue({
      ...defaultStats,
      data: {
        ...defaultStats.data,
        by_badge_type: { generated: 20, assisted: 0, reviewed: 0, suggested: 0 },
      },
    });
    renderWithProviders(<AIContentReview />);
    expect(screen.getByText("AI-generated")).toBeInTheDocument();
    expect(screen.queryByText("AI-assisted")).not.toBeInTheDocument();
  });
});
