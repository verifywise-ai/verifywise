import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import PendingIntakeSubmissions from "../PendingIntakeSubmissions";

const mockNavigateSearch = vi.fn();
vi.mock("../../../../application/hooks/useNavigateSearch", () => ({
  default: () => mockNavigateSearch,
}));

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 41,
  title: "Hiring screener",
  form_name: "AI use case request",
  submitter_name: "Sam",
  submitted_at: "2026-10-20T09:00:00.000Z",
  days_in_review: 11,
  ...overrides,
});

const pending = (items: ReturnType<typeof row>[], total = items.length) => ({
  total,
  items,
  limit: 500,
});

const copy = {
  description:
    "Submitted through an intake form. The use case is created when a reviewer approves the request.",
  exportNote: "Intake requests are not included in the use case export.",
};

describe("PendingIntakeSubmissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when no request is pending", () => {
    renderWithProviders(<PendingIntakeSubmissions {...copy} pending={pending([])} />);
    expect(screen.queryByTestId("pending-intake-submissions")).toBeNull();
  });

  it("lists each request, notes the export, and opens the submission review screen", () => {
    renderWithProviders(
      <PendingIntakeSubmissions
        {...copy}
        pending={pending([row(), row({ id: 42, title: null, submitter_name: null })])}
      />,
    );
    const rows = screen.getAllByTestId("pending-intake-submission-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Hiring screener");
    expect(rows[0].textContent).toContain("AI use case request");
    expect(rows[0].textContent).toContain("11");
    expect(rows[1].textContent).toContain("Untitled request");
    expect(
      screen.getByText("Intake requests are not included in the use case export."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("pending-intake-capped")).toBeNull();

    fireEvent.click(screen.getByTestId("pending-intake-review-42"));
    expect(mockNavigateSearch).toHaveBeenCalledWith("/intake-forms/submissions", {
      submission: "42",
    });
  });

  it("applies the use cases search to title, form and submitter", () => {
    const items = [
      row({ id: 1, title: "Chatbot", form_name: "Form A", submitter_name: "Ana" }),
      row({ id: 2, title: "Scoring", form_name: "Credit form", submitter_name: "Bo" }),
      row({ id: 3, title: "Vision", form_name: "Form A", submitter_name: "Cy" }),
    ];
    const ids = () =>
      screen
        .queryAllByTestId("pending-intake-submission-row")
        .map((r) => r.querySelector("button")?.getAttribute("data-testid"));

    const { rerender } = renderWithProviders(
      <PendingIntakeSubmissions {...copy} pending={pending(items)} searchTerm="chat" />,
    );
    expect(ids()).toEqual(["pending-intake-review-1"]);
    rerender(<PendingIntakeSubmissions {...copy} pending={pending(items)} searchTerm=" credit " />);
    expect(ids()).toEqual(["pending-intake-review-2"]);
    rerender(<PendingIntakeSubmissions {...copy} pending={pending(items)} searchTerm="cy" />);
    expect(ids()).toEqual(["pending-intake-review-3"]);
    rerender(<PendingIntakeSubmissions {...copy} pending={pending(items)} searchTerm="zzz" />);
    expect(ids()).toEqual([]);
    expect(screen.getByText("No intake requests match your search.")).toBeInTheDocument();
  });

  it("says when only the oldest requests are listed", () => {
    renderWithProviders(<PendingIntakeSubmissions {...copy} pending={pending([row()], 812)} />);
    expect(screen.getByTestId("pending-intake-capped").textContent).toBe(
      "Showing the oldest 1 of 812",
    );
  });
});
