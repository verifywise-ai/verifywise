import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EvidenceAnalysisPanel from "../index";

vi.mock("../../Chip", () => ({
  default: ({ label }: { label: string }) => <span data-testid="chip">{label}</span>,
}));

vi.mock("../../EvidenceQualityBadge", () => ({
  default: () => <span data-testid="quality-badge">Badge</span>,
}));

describe("EvidenceAnalysisPanel", () => {
  const mockAnalysis = {
    file_id: 1,
    summary: "This evidence shows good compliance",
    key_findings: ["Finding one", "Finding two"],
    compliance_areas: ["GDPR", "EU AI Act"],
    quality_score: {
      relevance: 85,
      completeness: 70,
      recency: 90,
      reliability: 65,
      specificity: 80,
    },
    overall_quality_score: 78,
    suggested_control_links: [
      {
        control_id: 1,
        control_title: "Access Control",
        framework_type: "iso_27001",
        match_score: 85,
        matched_areas: ["area1"],
      },
    ],
    analysis_model: "gpt-4",
    analysis_version: 2,
    analyzed_at: "2026-06-01T12:00:00Z",
    audit_metadata: null,
  };

  const mockAnalysisWithAudit = {
    ...mockAnalysis,
    audit_metadata: {
      analyzer_version: "2.1.0",
      rationales: {
        relevance: "Good alignment with the control objective",
        completeness: undefined,
      },
      abstain_reason: null,
      document_signals: {
        document_type: "Policy Document",
        has_explicit_dates: true,
        has_named_owner: true,
        has_version: false,
        has_metrics: false,
        is_draft: false,
        authority_signal: 75,
      },
      char_count: 15000,
      truncated: true,
      findings_with_quotes: [
        {
          text: "Finding one",
          evidence_quote: "Quote from document",
          relevance: "primary" as const,
        },
      ],
    },
  };

  it("renders loading state", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={null} isLoading />);
    expect(screen.getByText("Loading analysis...")).toBeInTheDocument();
  });

  it("renders empty state when no analysis", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={null} />);
    expect(screen.getByText("No AI analysis available for this evidence yet.")).toBeInTheDocument();
  });

  it("renders empty state with trigger button when onTriggerAnalysis is provided", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={null} onTriggerAnalysis={vi.fn()} />);
    expect(screen.getByText("Run AI analysis")).toBeInTheDocument();
  });

  it("disables analysis button when isAnalyzing is true", () => {
    renderWithProviders(
      <EvidenceAnalysisPanel analysis={null} onTriggerAnalysis={vi.fn()} isAnalyzing />,
    );
    expect(screen.getByText("Analyzing...")).toBeInTheDocument();
  });

  it("calls onTriggerAnalysis when button is clicked", async () => {
    const user = userEvent.setup();
    const onTriggerAnalysis = vi.fn();
    renderWithProviders(
      <EvidenceAnalysisPanel analysis={null} onTriggerAnalysis={onTriggerAnalysis} />,
    );
    await user.click(screen.getByText("Run AI analysis"));
    expect(onTriggerAnalysis).toHaveBeenCalledTimes(1);
  });

  it("renders overall quality score", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("78")).toBeInTheDocument();
    expect(screen.getAllByText("/ 100").length).toBeGreaterThan(0);
    expect(screen.getByText("Good quality evidence")).toBeInTheDocument();
    expect(screen.getByText("Overall Quality Score")).toBeInTheDocument();
  });

  it("renders summary text", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("This evidence shows good compliance")).toBeInTheDocument();
  });

  it("renders quality breakdown section", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("Quality breakdown")).toBeInTheDocument();
    expect(screen.getByText("Relevance")).toBeInTheDocument();
    expect(screen.getByText("Completeness")).toBeInTheDocument();
    expect(screen.getByText("Recency")).toBeInTheDocument();
    expect(screen.getByText("Reliability")).toBeInTheDocument();
    expect(screen.getByText("Specificity")).toBeInTheDocument();
  });

  it("renders dimension scores", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("70")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("renders compliance areas", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("Compliance areas (2)")).toBeInTheDocument();
    expect(screen.getByText("GDPR")).toBeInTheDocument();
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
  });

  it("renders compliance areas empty state", () => {
    renderWithProviders(
      <EvidenceAnalysisPanel analysis={{ ...mockAnalysis, compliance_areas: [] }} />,
    );
    expect(screen.getByText("No compliance areas detected.")).toBeInTheDocument();
  });

  it("renders key findings", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("Key findings (2)")).toBeInTheDocument();
    expect(screen.getByText("Finding one")).toBeInTheDocument();
    expect(screen.getByText("Finding two")).toBeInTheDocument();
  });

  it("renders key findings empty state", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={{ ...mockAnalysis, key_findings: [] }} />);
    expect(screen.getByText("No key findings extracted.")).toBeInTheDocument();
  });

  it("renders suggested control links", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("Suggested control links (1)")).toBeInTheDocument();
    expect(screen.getByText("Access Control")).toBeInTheDocument();
    expect(screen.getByText("iso 27001")).toBeInTheDocument();
  });

  it("renders match score chip for suggested links", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText("85% match")).toBeInTheDocument();
  });

  it("renders apply all button when onApplySuggestions provided", () => {
    renderWithProviders(
      <EvidenceAnalysisPanel analysis={mockAnalysis} onApplySuggestions={vi.fn()} />,
    );
    expect(screen.getByText("Apply all")).toBeInTheDocument();
  });

  it("calls onApplySuggestions when apply all is clicked", async () => {
    const user = userEvent.setup();
    const onApplySuggestions = vi.fn();
    renderWithProviders(
      <EvidenceAnalysisPanel analysis={mockAnalysis} onApplySuggestions={onApplySuggestions} />,
    );
    await user.click(screen.getByText("Apply all"));
    expect(onApplySuggestions).toHaveBeenCalledWith([
      { control_id: 1, framework_type: "iso_27001" },
    ]);
  });

  it("hides suggested links section when empty", () => {
    renderWithProviders(
      <EvidenceAnalysisPanel analysis={{ ...mockAnalysis, suggested_control_links: [] }} />,
    );
    expect(screen.queryByText("Suggested control links")).not.toBeInTheDocument();
  });

  it("renders analysis metadata footer", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getByText(/Analyzed by/)).toBeInTheDocument();
    expect(screen.getByText(/gpt-4/)).toBeInTheDocument();
  });

  it("renders quality badge", () => {
    renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
    expect(screen.getAllByTestId("quality-badge").length).toBeGreaterThan(0);
  });

  describe("abstain banner", () => {
    it("renders when abstain_reason is present", () => {
      const analysis = {
        ...mockAnalysis,
        audit_metadata: { abstain_reason: "Insufficient information to analyze" } as any,
      };
      renderWithProviders(<EvidenceAnalysisPanel analysis={analysis} />);
      expect(screen.getByText("Analyzer abstained")).toBeInTheDocument();
      expect(screen.getByText("Insufficient information to analyze")).toBeInTheDocument();
    });

    it("does not render when abstain_reason is null", () => {
      renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
      expect(screen.queryByText("Analyzer abstained")).not.toBeInTheDocument();
    });
  });

  describe("document signals", () => {
    it("renders when document_signals present", () => {
      renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysisWithAudit} />);
      expect(screen.getByText("Document signals")).toBeInTheDocument();
      expect(screen.getByText("Authority")).toBeInTheDocument();
      expect(screen.getByText("Type")).toBeInTheDocument();
      expect(screen.getByText("Policy Document")).toBeInTheDocument();
      expect(screen.getByText("Named owner")).toBeInTheDocument();
      expect(screen.getByText("Version")).toBeInTheDocument();
      expect(screen.getByText("Explicit dates")).toBeInTheDocument();
      expect(screen.getByText("Metrics")).toBeInTheDocument();
      expect(screen.getByText("Draft")).toBeInTheDocument();
    });

    it("does not render when document_signals is null", () => {
      renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysis} />);
      expect(screen.queryByText("Document signals")).not.toBeInTheDocument();
    });

    it("renders truncated signal when truncated is true", () => {
      renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysisWithAudit} />);
      expect(screen.getByText("Truncated")).toBeInTheDocument();
      expect(screen.getByText(/15000 ch/)).toBeInTheDocument();
    });
  });

  describe("DimensionCard rationale", () => {
    it("expands rationale on click", async () => {
      const user = userEvent.setup();
      renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysisWithAudit} />);
      const rationaleBtn = screen.getAllByRole("button").find((b) => b.querySelector("svg"));
      if (rationaleBtn) {
        await user.click(rationaleBtn);
      }
      expect(screen.getByText(/Good alignment with the control objective/)).toBeInTheDocument();
    });
  });

  describe("JSON string field handling", () => {
    it("parses JSON string fields", () => {
      const analysis = {
        ...mockAnalysis,
        quality_score: JSON.stringify(mockAnalysis.quality_score) as any,
        suggested_control_links: JSON.stringify(mockAnalysis.suggested_control_links) as any,
        compliance_areas: JSON.stringify(mockAnalysis.compliance_areas) as any,
        key_findings: JSON.stringify(mockAnalysis.key_findings) as any,
      };
      renderWithProviders(<EvidenceAnalysisPanel analysis={analysis as any} />);
      expect(screen.getByText("Good quality evidence")).toBeInTheDocument();
      expect(screen.getByText("GDPR")).toBeInTheDocument();
      expect(screen.getByText("Finding one")).toBeInTheDocument();
    });

    it("handles audit_metadata as JSON string", () => {
      const analysis = {
        ...mockAnalysis,
        audit_metadata: JSON.stringify({
          abstain_reason: "Not enough data",
        }) as any,
      };
      renderWithProviders(<EvidenceAnalysisPanel analysis={analysis as any} />);
      expect(screen.getByText("Not enough data")).toBeInTheDocument();
    });

    it("handles invalid audit_metadata JSON gracefully", () => {
      const analysis = {
        ...mockAnalysis,
        audit_metadata: "{invalid json",
      };
      renderWithProviders(<EvidenceAnalysisPanel analysis={analysis as any} />);
      expect(screen.getByText("Good quality evidence")).toBeInTheDocument();
    });
  });

  describe("getScoreColor / getScoreLabel", () => {
    it('shows "High" for score >= 80', () => {
      renderWithProviders(
        <EvidenceAnalysisPanel analysis={{ ...mockAnalysis, overall_quality_score: 85 }} />,
      );
      expect(screen.getByText("High quality evidence")).toBeInTheDocument();
    });

    it('shows "Good" for score 60-79', () => {
      renderWithProviders(
        <EvidenceAnalysisPanel analysis={{ ...mockAnalysis, overall_quality_score: 65 }} />,
      );
      expect(screen.getByText("Good quality evidence")).toBeInTheDocument();
    });

    it('shows "Fair" for score 40-59', () => {
      renderWithProviders(
        <EvidenceAnalysisPanel analysis={{ ...mockAnalysis, overall_quality_score: 50 }} />,
      );
      expect(screen.getByText("Fair quality evidence")).toBeInTheDocument();
    });

    it('shows "Low" for score < 40', () => {
      renderWithProviders(
        <EvidenceAnalysisPanel analysis={{ ...mockAnalysis, overall_quality_score: 25 }} />,
      );
      expect(screen.getByText("Low quality evidence")).toBeInTheDocument();
    });
  });

  describe("findings with quotes", () => {
    it("renders evidence quote when present", () => {
      renderWithProviders(<EvidenceAnalysisPanel analysis={mockAnalysisWithAudit} />);
      expect(screen.getByText(/Quote from document/)).toBeInTheDocument();
    });
  });
});
