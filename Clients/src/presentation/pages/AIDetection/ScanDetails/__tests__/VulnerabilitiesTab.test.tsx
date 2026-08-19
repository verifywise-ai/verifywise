import { render, screen } from "@testing-library/react";
import { VulnerabilitiesTab } from "../VulnerabilitiesTab";
import type { Finding } from "../../../../../domain/ai-detection/types";

vi.mock("../../../../../application/repository/aiDetection.repository", () => ({
  updateFindingGovernanceStatus: vi.fn(),
  createSuppression: vi.fn(),
}));

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 1,
    finding_type: "prompt_injection",
    category: "Vulnerability",
    name: "Prompt injection risk",
    provider: "OpenAI",
    confidence: "high",
    risk_level: "high",
    file_count: 1,
    file_paths: [],
    ...overrides,
  };
}

describe("VulnerabilitiesTab", () => {
  it("shows the empty state when there are no vulnerability findings", () => {
    render(
      <VulnerabilitiesTab
        vulnerabilityFindings={[]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("No LLM vulnerabilities detected")).toBeInTheDocument();
  });

  it("renders a stat card total that matches the number of findings", () => {
    render(
      <VulnerabilitiesTab
        vulnerabilityFindings={[
          makeFinding({ id: 1, finding_type: "prompt_injection" }),
          makeFinding({ id: 2, finding_type: "pii_exposure" }),
        ]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders a row for each vulnerability finding", () => {
    render(
      <VulnerabilitiesTab
        vulnerabilityFindings={[
          makeFinding({ id: 1, name: "Prompt injection risk" }),
          makeFinding({ id: 2, name: "PII exposure risk", finding_type: "pii_exposure" }),
        ]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("Prompt injection risk")).toBeInTheDocument();
    expect(screen.getByText("PII exposure risk")).toBeInTheDocument();
  });

  it("filters out suppressed findings when showSuppressed is false", () => {
    render(
      <VulnerabilitiesTab
        vulnerabilityFindings={[
          makeFinding({ id: 1, name: "Suppressed one", suppressed: true }),
          makeFinding({ id: 2, name: "Visible one" }),
        ]}
        showSuppressed={false}
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.queryByText("Suppressed one")).not.toBeInTheDocument();
    expect(screen.getByText("Visible one")).toBeInTheDocument();
  });
});
