import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import PolicyTable from "../PolicyTable";
import { vi } from "vitest";

// Mock useUsers hook
vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "John", surname: "Doe" },
      { id: 2, name: "Jane", surname: "Smith" },
    ],
  }),
}));

describe("PolicyTable", () => {
  const defaultProps = {
    data: [] as any[],
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    onLinkedObjects: vi.fn(),
    isLoading: false,
    error: null as Error | null,
    onRefresh: vi.fn(),
  };

  it("renders loading state", () => {
    renderWithProviders(<PolicyTable {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Loading policies...")).toBeInTheDocument();
  });

  it("renders error state", () => {
    renderWithProviders(<PolicyTable {...defaultProps} error={new Error("Network error")} />);
    expect(screen.getByText("Error loading policies: Network error")).toBeInTheDocument();
  });

  it("renders empty state when data is empty", () => {
    renderWithProviders(<PolicyTable {...defaultProps} />);
    expect(screen.getByText("No policies found")).toBeInTheDocument();
  });

  it("renders policy rows when data is provided", () => {
    const data = [
      {
        id: 1,
        title: "Data Protection Policy",
        content_html: "",
        status: "Draft",
        next_review_date: "2026-06-01",
        author_id: 1,
        last_updated_at: "2026-04-01T10:00:00Z",
        last_updated_by: 2,
        created_at: "2026-01-01T00:00:00Z",
      },
    ] as any;
    renderWithProviders(<PolicyTable {...defaultProps} data={data} />);
    expect(screen.getByText("Data Protection Policy")).toBeInTheDocument();
  });

  it("truncates long policy titles to 30 characters", () => {
    const data = [
      {
        id: 1,
        title: "This Is A Very Long Policy Title That Should Be Truncated",
        content_html: "",
        status: "Approved",
        next_review_date: null,
        author_id: 1,
        last_updated_at: null,
        last_updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ] as any;
    renderWithProviders(<PolicyTable {...defaultProps} data={data} />);
    expect(screen.getByText("This Is A Very Long Policy Tit...")).toBeInTheDocument();
  });

  it("renders the status chip for a policy", () => {
    const data = [
      {
        id: 1,
        title: "Test Policy",
        content_html: "",
        status: "Draft",
        next_review_date: null,
        author_id: 1,
        last_updated_at: null,
        last_updated_by: null,
        created_at: "2026-01-01T00:00:00Z",
      },
    ] as any;
    renderWithProviders(<PolicyTable {...defaultProps} data={data} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });
});
