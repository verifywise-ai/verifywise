import { render, screen, fireEvent } from "@testing-library/react";
import { SecurityFindingsTab } from "../SecurityFindingsTab";
import type { SecurityFinding, SecuritySummary } from "../../../../../domain/ai-detection/types";

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    id: 1,
    finding_type: "model_security",
    category: "Model security",
    name: "unsafe_pickle_load",
    provider: "PyTorch",
    confidence: "high",
    file_count: 1,
    file_paths: [],
    severity: "critical",
    cwe_id: "CWE-502",
    cwe_name: "Deserialization of Untrusted Data",
    owasp_ml_id: "ML06",
    owasp_ml_name: "AI Supply Chain Attacks",
    threat_type: "Arbitrary code execution",
    operator_name: "torch.load",
    module_name: "torch",
    ...overrides,
  };
}

const summary: SecuritySummary = {
  total: 3,
  by_severity: { critical: 1, high: 1, medium: 1, low: 0 },
  by_threat_type: {},
  model_files_scanned: 4,
};

describe("SecurityFindingsTab", () => {
  it("shows the clean empty state when there are no findings and no severity filter", () => {
    render(
      <SecurityFindingsTab
        summary={null}
        findings={[]}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        severityFilter={null}
        onSeverityFilterChange={vi.fn()}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("No security issues detected")).toBeInTheDocument();
  });

  it("shows a filtered empty message when a severity filter yields no results", () => {
    render(
      <SecurityFindingsTab
        summary={summary}
        findings={[]}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        severityFilter="low"
        onSeverityFilterChange={vi.fn()}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("No low severity findings")).toBeInTheDocument();
  });

  it("renders summary cards when summary total is greater than zero", () => {
    render(
      <SecurityFindingsTab
        summary={summary}
        findings={[]}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        severityFilter={null}
        onSeverityFilterChange={vi.fn()}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("Total findings")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("toggles the severity filter when a summary card is clicked", () => {
    const onSeverityFilterChange = vi.fn();
    render(
      <SecurityFindingsTab
        summary={summary}
        findings={[]}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        severityFilter={null}
        onSeverityFilterChange={onSeverityFilterChange}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    fireEvent.click(screen.getByText("Critical"));
    expect(onSeverityFilterChange).toHaveBeenCalled();
    const updater = onSeverityFilterChange.mock.calls[0][0];
    expect(updater(null)).toBe("critical");
    expect(updater("critical")).toBeNull();
  });

  it("renders a row for each finding and the scanned model file count", () => {
    render(
      <SecurityFindingsTab
        summary={summary}
        findings={[makeFinding({ id: 1, name: "unsafe_pickle_load" })]}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        severityFilter={null}
        onSeverityFilterChange={vi.fn()}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("unsafe_pickle_load")).toBeInTheDocument();
    expect(screen.getByText("4 model files scanned")).toBeInTheDocument();
  });

  it("shows pagination controls and triggers onPageChange", () => {
    const onPageChange = vi.fn();
    render(
      <SecurityFindingsTab
        summary={summary}
        findings={[makeFinding()]}
        page={2}
        totalPages={3}
        onPageChange={onPageChange}
        severityFilter={null}
        onSeverityFilterChange={vi.fn()}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Previous"));
    expect(onPageChange).toHaveBeenCalled();
  });

  it("does not render pagination when totalPages is 1", () => {
    render(
      <SecurityFindingsTab
        summary={summary}
        findings={[makeFinding()]}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        severityFilter={null}
        onSeverityFilterChange={vi.fn()}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.queryByText(/Page \d of \d/)).not.toBeInTheDocument();
  });
});
