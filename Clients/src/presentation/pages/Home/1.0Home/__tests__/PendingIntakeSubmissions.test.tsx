import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import PendingIntakeSubmissions from "../PendingIntakeSubmissions";

const mockNavigateSearch = vi.fn();
vi.mock("../../../../../application/hooks/useNavigateSearch", () => ({
  default: () => mockNavigateSearch,
}));

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  title: "Hiring screener",
  form_name: "AI use case request",
  submitter_name: "Sam",
  risk_tier: null,
  submitted_at: "2026-10-20T09:00:00.000Z",
  days_in_review: 11,
  ...overrides,
});

describe("PendingIntakeSubmissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when no request is pending", () => {
    renderWithProviders(<PendingIntakeSubmissions submissions={[]} />);
    expect(screen.queryByTestId("pending-intake-submissions")).toBeNull();
  });

  it("lists each request and opens the submission review screen", () => {
    renderWithProviders(
      <PendingIntakeSubmissions
        submissions={[row(), row({ id: 42, title: null, submitter_name: null })]}
      />,
    );
    const rows = screen.getAllByTestId("pending-intake-submission-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Hiring screener");
    expect(rows[0].textContent).toContain("AI use case request");
    expect(rows[0].textContent).toContain("11");
    expect(rows[1].textContent).toContain("Untitled request");

    fireEvent.click(screen.getByTestId("pending-intake-review-42"));
    expect(mockNavigateSearch).toHaveBeenCalledWith("/intake-forms/submissions", {
      submission: "42",
    });
  });
});
