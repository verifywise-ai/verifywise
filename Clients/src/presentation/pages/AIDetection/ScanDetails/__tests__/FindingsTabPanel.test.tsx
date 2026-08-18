import { render, screen, fireEvent } from "@testing-library/react";
import { AlertCircle } from "lucide-react";
import { FindingsTabPanel } from "../FindingsTabPanel";
import type { Finding } from "../../../../../domain/ai-detection/types";

vi.mock("../../../../../application/repository/aiDetection.repository", () => ({
  updateFindingGovernanceStatus: vi.fn(),
  createSuppression: vi.fn(),
}));

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 1,
    finding_type: "library",
    category: "AI/ML",
    name: "openai",
    provider: "OpenAI",
    confidence: "high",
    risk_level: "high",
    file_count: 1,
    file_paths: [],
    ...overrides,
  };
}

const defaultProps = {
  description: "Libraries detected in this repository.",
  findings: [] as Finding[],
  showSuppressed: true,
  scanId: 1,
  repositoryOwner: "acme",
  repositoryName: "widgets",
  emptyState: <div>No findings found</div>,
  page: 1,
  totalPages: 1,
  onPageChange: vi.fn(),
};

describe("FindingsTabPanel", () => {
  it("renders the description text", () => {
    render(<FindingsTabPanel {...defaultProps} />);
    expect(screen.getByText("Libraries detected in this repository.")).toBeInTheDocument();
  });

  it("renders the empty state when there are no findings", () => {
    render(<FindingsTabPanel {...defaultProps} />);
    expect(screen.getByText("No findings found")).toBeInTheDocument();
  });

  it("renders finding rows for each finding", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        findings={[makeFinding({ id: 1, name: "openai" }), makeFinding({ id: 2, name: "numpy" })]}
      />,
    );

    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("numpy")).toBeInTheDocument();
    expect(screen.queryByText("No findings found")).not.toBeInTheDocument();
  });

  it("filters out suppressed findings when showSuppressed is false", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        showSuppressed={false}
        findings={[
          makeFinding({ id: 1, name: "openai", suppressed: true }),
          makeFinding({ id: 2, name: "numpy" }),
        ]}
      />,
    );

    expect(screen.queryByText("openai")).not.toBeInTheDocument();
    expect(screen.getByText("numpy")).toBeInTheDocument();
  });

  it("shows suppressed findings when showSuppressed is true", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        showSuppressed
        findings={[makeFinding({ id: 1, name: "openai", suppressed: true })]}
      />,
    );

    expect(screen.getByText("openai")).toBeInTheDocument();
  });

  it("renders an alert box when provided and there are findings", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        findings={[makeFinding()]}
        alertBox={{ severity: "warning", title: "Heads up", body: "Review these findings." }}
      />,
    );

    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Review these findings.")).toBeInTheDocument();
  });

  it("does not render the alert box when there are no findings", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        findings={[]}
        alertBox={{ severity: "error", title: "Heads up", body: "Review these findings." }}
      />,
    );

    expect(screen.queryByText("Heads up")).not.toBeInTheDocument();
  });

  it("renders a summary box when provided", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        summaryBox={{ icon: AlertCircle, text: "Summary text", subtext: "Summary subtext" }}
      />,
    );

    expect(screen.getByText("Summary text")).toBeInTheDocument();
    expect(screen.getByText("Summary subtext")).toBeInTheDocument();
  });

  it("renders stat cards row content when provided", () => {
    render(<FindingsTabPanel {...defaultProps} statCardsRow={<div>Stat cards row</div>} />);

    expect(screen.getByText("Stat cards row")).toBeInTheDocument();
  });

  it("uses the grouped layout with a list heading when listHeading is set", () => {
    render(
      <FindingsTabPanel {...defaultProps} listHeading="Libraries" findings={[makeFinding()]} />,
    );

    expect(screen.getByText("Libraries")).toBeInTheDocument();
  });

  it("renders pagination controls when totalPages > 1 and calls onPageChange", () => {
    const onPageChange = vi.fn();
    render(
      <FindingsTabPanel
        {...defaultProps}
        listHeading="Libraries"
        findings={[makeFinding()]}
        page={2}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    );

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next"));
    expect(onPageChange).toHaveBeenCalled();
    const updater = onPageChange.mock.calls[0][0];
    expect(updater(2)).toBe(3);
  });

  it("disables the Previous button on the first page", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        listHeading="Libraries"
        findings={[makeFinding()]}
        page={1}
        totalPages={3}
      />,
    );

    expect(screen.getByText("Previous").closest("button")).toBeDisabled();
  });

  it("disables the Next button on the last page", () => {
    render(
      <FindingsTabPanel
        {...defaultProps}
        listHeading="Libraries"
        findings={[makeFinding()]}
        page={3}
        totalPages={3}
      />,
    );

    expect(screen.getByText("Next").closest("button")).toBeDisabled();
  });

  it("does not render pagination when totalPages is 1", () => {
    render(
      <FindingsTabPanel {...defaultProps} listHeading="Libraries" findings={[makeFinding()]} />,
    );

    expect(screen.queryByText(/Page \d of \d/)).not.toBeInTheDocument();
  });
});
