import { render, screen, fireEvent } from "@testing-library/react";
import { ComplianceTab } from "../ComplianceTab";
import type { ComplianceMappingResponse } from "../../../../../domain/ai-detection/types";

function makeComplianceData(
  overrides: Partial<ComplianceMappingResponse> = {},
): ComplianceMappingResponse {
  return {
    scanId: 1,
    repository: { owner: "acme", name: "widgets", url: "https://github.com/acme/widgets" },
    mappings: [
      {
        findingId: 1,
        findingName: "openai",
        findingType: "library",
        provider: "OpenAI",
        requirements: [],
        riskFactors: ["Data may leave the org"],
        documentationNeeds: ["Document the data flow"],
      },
    ],
    checklist: [
      {
        id: "chk-1",
        text: "Document AI system transparency measures",
        category: "transparency",
        articleRef: "Article 13",
        priority: "high",
        relatedFindings: [{ id: 1, name: "openai", type: "library" }],
        completed: false,
      },
    ],
    summary: {
      totalRequirements: 5,
      byCategory: { transparency: 2, documentation: 1, risk_management: 0 } as never,
      byPriority: { high: 1, medium: 3, low: 1 },
      coveragePercentage: 62.5,
    },
    generatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ComplianceTab", () => {
  it("shows a loading message while compliance data loads", () => {
    render(<ComplianceTab complianceData={null} complianceLoading />);
    expect(screen.getByText("Loading compliance data...")).toBeInTheDocument();
  });

  it("shows an error message when compliance data failed to load", () => {
    render(<ComplianceTab complianceData={null} complianceLoading={false} />);
    expect(screen.getByText("Unable to load compliance data")).toBeInTheDocument();
  });

  it("renders summary cards with counts and coverage percentage", () => {
    render(<ComplianceTab complianceData={makeComplianceData()} complianceLoading={false} />);

    expect(screen.getByText("Total requirements")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("High priority")).toBeInTheDocument();
    expect(screen.getByText("63%")).toBeInTheDocument();
  });

  it("renders category breakdown chips, skipping zero-count categories", () => {
    render(<ComplianceTab complianceData={makeComplianceData()} complianceLoading={false} />);

    expect(screen.getByText("Transparency (2)")).toBeInTheDocument();
    expect(screen.getByText("Documentation (1)")).toBeInTheDocument();
    expect(screen.queryByText(/Risk management/)).not.toBeInTheDocument();
  });

  it("shows the clean checklist empty state when there are no checklist items", () => {
    render(
      <ComplianceTab
        complianceData={makeComplianceData({ checklist: [] })}
        complianceLoading={false}
      />,
    );

    expect(screen.getByText("No specific compliance actions needed")).toBeInTheDocument();
  });

  it("renders a checklist item with article, category and priority badges", () => {
    render(<ComplianceTab complianceData={makeComplianceData()} complianceLoading={false} />);

    expect(
      screen.getByText("Document AI system transparency measures"),
    ).toBeInTheDocument();
    expect(screen.getByText("Article 13")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("expands a checklist item to show related findings grouped by type", () => {
    render(<ComplianceTab complianceData={makeComplianceData()} complianceLoading={false} />);

    expect(screen.queryByText("AI/ML libraries (1)")).not.toBeVisible();

    fireEvent.click(screen.getByText("Document AI system transparency measures"));

    expect(screen.getByText("AI/ML libraries (1)")).toBeVisible();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("Document the data flow")).toBeInTheDocument();
    expect(screen.getByText("Data may leave the org")).toBeInTheDocument();
  });

  it("toggles a checklist item open and closed without error", () => {
    render(<ComplianceTab complianceData={makeComplianceData()} complianceLoading={false} />);

    const header = screen.getByText("Document AI system transparency measures");
    fireEvent.click(header);
    expect(screen.getByText("AI/ML libraries (1)")).toBeVisible();

    fireEvent.click(header);
    // Still present in the DOM (Collapse keeps content mounted), header remains clickable
    expect(header).toBeInTheDocument();
  });

  it("shows a fallback message when a checklist item has no related findings", () => {
    render(
      <ComplianceTab
        complianceData={makeComplianceData({
          checklist: [
            {
              id: "chk-2",
              text: "Generic requirement",
              category: "documentation",
              articleRef: "Article 11",
              priority: "medium",
              relatedFindings: [],
              completed: false,
            },
          ],
        })}
        complianceLoading={false}
      />,
    );

    fireEvent.click(screen.getByText("Generic requirement"));
    expect(
      screen.getByText(/This requirement applies to AI components detected in the scan/),
    ).toBeInTheDocument();
  });

  it("renders the generated timestamp", () => {
    render(<ComplianceTab complianceData={makeComplianceData()} complianceLoading={false} />);
    expect(screen.getByText(/Compliance mapping generated/)).toBeInTheDocument();
  });
});
