import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReportAnalysisPanel from "../index";
import type { AnalysisPayload, ReportRunAnalysis } from "../../../../domain/interfaces/i.reporting";

function row(
  sectionKey: string,
  payload: AnalysisPayload,
  overrides: Partial<ReportRunAnalysis> = {},
): ReportRunAnalysis {
  return {
    id: overrides.id ?? 1,
    report_run_id: 42,
    section_key: sectionKey,
    payload,
    analysis_model: "gpt-4o-mini",
    analysis_version: 1,
    analyzed_at: "2026-06-01T12:00:00Z",
    analyzed_by: 7,
    audit_metadata: null,
    ...overrides,
  };
}

describe("ReportAnalysisPanel", () => {
  it("renders skeletons while loading", () => {
    const { container } = renderWithProviders(
      <ReportAnalysisPanel analyses={undefined} isLoading />,
    );
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBeGreaterThan(0);
  });

  it("renders the empty state when there are no analyses", () => {
    renderWithProviders(<ReportAnalysisPanel analyses={[]} />);
    expect(
      screen.getByText("No AI analyses were generated for this report run."),
    ).toBeInTheDocument();
  });

  it("renders the empty state when analyses is undefined", () => {
    renderWithProviders(<ReportAnalysisPanel analyses={undefined} />);
    expect(
      screen.getByText("No AI analyses were generated for this report run."),
    ).toBeInTheDocument();
  });

  it("renders a prose section with its heading and summary", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("executiveSummary", {
            summary: "Governance posture is broadly sound with two material gaps.",
            abstain_reason: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
    expect(
      screen.getByText("Governance posture is broadly sound with two material gaps."),
    ).toBeInTheDocument();
  });

  it("renders a list section with its items, severities and sections", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("keyFindings", {
            findings: [
              { text: "Two controls lack evidence.", section: "compliance", severity: "high" },
              { text: "Vendor reviews are overdue.", section: "vendors", severity: "medium" },
            ],
            abstain_reason: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Key findings")).toBeInTheDocument();
    expect(screen.getByText("Two controls lack evidence.")).toBeInTheDocument();
    expect(screen.getByText("Vendor reviews are overdue.")).toBeInTheDocument();
    expect(screen.getByText("compliance")).toBeInTheDocument();
    expect(screen.getByText("vendors")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("medium")).toBeInTheDocument();
  });

  it("renders recommended actions with owner and rationale", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("recommendedActions", {
            actions: [
              {
                action: "Collect evidence for the two open controls.",
                suggestedOwner: "Compliance lead",
                priority: "critical",
                rationale: "Both controls are unevidenced in the input.",
              },
            ],
            abstain_reason: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Recommended actions")).toBeInTheDocument();
    expect(screen.getByText("Collect evidence for the two open controls.")).toBeInTheDocument();
    expect(screen.getByText(/Owner: Compliance lead/)).toBeInTheDocument();
  });

  it("renders risk analysis narrative and top risks with verbatim levels", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("riskAnalysis", {
            narrative: "Risk exposure is concentrated in third-party models.",
            top_risks: [{ name: "Model drift", level: "Very high", why: "No monitoring in place." }],
            abstain_reason: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Risk analysis")).toBeInTheDocument();
    expect(
      screen.getByText("Risk exposure is concentrated in third-party models."),
    ).toBeInTheDocument();
    expect(screen.getByText("Model drift")).toBeInTheDocument();
    expect(screen.getByText("Very high")).toBeInTheDocument();
    expect(screen.getByText("No monitoring in place.")).toBeInTheDocument();
  });

  it("renders the compliance gap scores caveat", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("complianceGap", {
            narrative: "Readiness is partially scored.",
            gaps: [{ control: "A.5.1", gap: "No documented policy.", priority: "high" }],
            scores_caveat: "Missing scores are not evidence of an absence of gaps.",
            abstain_reason: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Compliance gap analysis")).toBeInTheDocument();
    expect(
      screen.getByText("Missing scores are not evidence of an absence of gaps."),
    ).toBeInTheDocument();
    expect(screen.getByText("A.5.1")).toBeInTheDocument();
    expect(screen.getByText("No documented policy.")).toBeInTheDocument();
  });

  it("renders vendor risk concerns under a third-party heading", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("vendorRisk", {
            narrative: "Two vendors process personal data.",
            concerns: [
              { vendor: "Acme AI", concern: "No DPA on file.", severity: "critical" },
            ],
            abstain_reason: null,
          }),
        ]}
      />,
    );
    expect(screen.getByText("Third-party risk analysis")).toBeInTheDocument();
    expect(screen.getByText("Acme AI")).toBeInTheDocument();
    expect(screen.getByText("No DPA on file.")).toBeInTheDocument();
  });

  it("renders the per-section summaries record", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("sectionSummaries", {
            summaries: {
              compliance: "Compliance coverage is at 72 percent.",
              vendors: "Three vendors are pending review.",
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Per-section summaries")).toBeInTheDocument();
    expect(screen.getByText("compliance")).toBeInTheDocument();
    expect(screen.getByText("Compliance coverage is at 72 percent.")).toBeInTheDocument();
    expect(screen.getByText("Three vendors are pending review.")).toBeInTheDocument();
  });

  it("renders the not-generated state for a null payload without crashing", () => {
    renderWithProviders(<ReportAnalysisPanel analyses={[row("riskAnalysis", null)]} />);
    expect(screen.getByText("Risk analysis")).toBeInTheDocument();
    expect(screen.getByText("This section was not generated.")).toBeInTheDocument();
  });

  it("surfaces abstain_reason and suppresses the not-generated fallback", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("keyFindings", {
            findings: [],
            abstain_reason: "The supplied data contained no controls to assess.",
          }),
        ]}
      />,
    );
    expect(
      screen.getByText(/The supplied data contained no controls to assess\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("This section was not generated.")).not.toBeInTheDocument();
  });

  it("renders the model and analyzed timestamp as footer metadata", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[row("executiveSummary", { summary: "All good.", abstain_reason: null })]}
      />,
    );
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
  });

  it("falls back when analysis_model is null", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row(
            "executiveSummary",
            { summary: "All good.", abstain_reason: null },
            { analysis_model: null },
          ),
        ]}
      />,
    );
    expect(screen.getByText(/Model not recorded/)).toBeInTheDocument();
  });

  it("falls back to the raw key for an unmapped section_key", () => {
    renderWithProviders(<ReportAnalysisPanel analyses={[row("brandNewAnalyzer", null)]} />);
    expect(screen.getByText("brandNewAnalyzer")).toBeInTheDocument();
    expect(screen.getByText("This section was not generated.")).toBeInTheDocument();
  });

  it("renders one card per analysis", () => {
    renderWithProviders(
      <ReportAnalysisPanel
        analyses={[
          row("executiveSummary", { summary: "Summary text.", abstain_reason: null }, { id: 1 }),
          row("sectionSummaries", { summaries: { compliance: "Section text." } }, { id: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("Executive summary")).toBeInTheDocument();
    expect(screen.getByText("Per-section summaries")).toBeInTheDocument();
  });
});
