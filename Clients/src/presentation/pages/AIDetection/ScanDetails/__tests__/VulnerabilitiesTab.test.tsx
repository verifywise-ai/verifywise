import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
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
  it("shows the green clean state only when the checks ran", () => {
    renderWithProviders(
      <VulnerabilitiesTab
        vulnerabilityFindings={[]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
        vulnerabilityCheckStatus="ran"
      />,
    );

    expect(screen.getByText("No LLM vulnerabilities detected")).toBeInTheDocument();
    expect(screen.queryByText("Vulnerability checks didn't run for this scan")).toBeNull();
  });

  it("shows a neutral not-checked state with a settings link when checks were off", () => {
    renderWithProviders(
      <VulnerabilitiesTab
        vulnerabilityFindings={[]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
        vulnerabilityCheckStatus="off"
      />,
    );

    expect(screen.getByText("Vulnerability checks didn't run for this scan")).toBeInTheDocument();
    expect(screen.queryByText("No LLM vulnerabilities detected")).toBeNull();
    // No zero tiles that would read as "checked, none found"
    expect(screen.queryByText("Total")).toBeNull();
    fireEvent.click(screen.getByText("Open vulnerability settings"));
  });

  it("explains that incremental scans skip the checks, without a settings link", () => {
    renderWithProviders(
      <VulnerabilitiesTab
        vulnerabilityFindings={[]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
        vulnerabilityCheckStatus="incremental"
      />,
    );

    expect(screen.getByText(/Incremental scans skip vulnerability checks/)).toBeInTheDocument();
    expect(screen.queryByText("Open vulnerability settings")).toBeNull();
  });

  it("does not claim a clean result for older scans with no recorded status", () => {
    renderWithProviders(
      <VulnerabilitiesTab
        vulnerabilityFindings={[]}
        showSuppressed
        scanId={1}
        repositoryOwner="acme"
        repositoryName="widgets"
      />,
    );

    expect(screen.getByText("No vulnerability check recorded for this scan")).toBeInTheDocument();
    expect(screen.queryByText("No LLM vulnerabilities detected")).toBeNull();
  });

  it("renders a stat card total that matches the number of findings", () => {
    renderWithProviders(
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
    renderWithProviders(
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
    renderWithProviders(
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
