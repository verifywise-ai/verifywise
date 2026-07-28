import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const runNowMutate = vi.fn();

vi.mock("../../../../application/hooks/useReporting", () => ({
  useCreateScheduledReport: () => ({ mutate: vi.fn(), isPending: false }),
  useRunTemplateNow: () => ({ mutate: runNowMutate, isPending: false }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: 1, project_title: "Project A" }], isLoading: false }),
}));

// Settled keyless org. The real hook reports hasKeys optimistically true
// while loading, so a mock without `loading: false` would not exercise the
// gate at all.
vi.mock("../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => ({ hasKeys: false, loading: false, data: null, error: null }),
}));

import ConfigureReportWizard from "../ConfigureReportWizard";

// canNext() blocks step 1 unless at least one section has
// defaultEnabled !== false, and sections come from
// latestVersion.sections_config.sections. A fixture without one can never
// reach step 2, so the AI assertions would fail on an empty Sections step
// rather than on anything this test is about.
const TEMPLATE_FIXTURE = {
  id: 1,
  name: "T",
  default_scope: "organization",
  latestVersion: {
    id: 5,
    sections_config: {
      sections: [
        {
          key: "projectRisks",
          reportSectionKey: "projectRisks",
          label: "Use case risks",
          defaultEnabled: true,
        },
      ],
    },
  },
};

describe("ConfigureReportWizard", () => {
  beforeEach(() => {
    runNowMutate.mockReset();
  });

  it("shows scope step and disables next when project scope has no project", () => {
    render(
      <ConfigureReportWizard
        template={{
          id: 1,
          name: "Daily",
          latestVersion: { sections_config: { sections: [] }, ai_blocks_config: {} },
        }}
        mode="schedule"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Scope/i)).toBeInTheDocument();
  });

  it("offers all seven AI blocks, not the legacy three", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />);
    // Step 0 (Scope, org scope so no project needed) -> 1 (Sections) -> 2 (AI)
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    for (const label of [
      "Per-section summaries",
      "Executive summary",
      "Key findings",
      "Recommended actions",
      "Risk analysis",
      "Compliance gap analysis",
      "Third-party risk analysis",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("no longer renders raw camelCase keys as labels", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByText("executiveSummary")).not.toBeInTheDocument();
  });

  // Format sits on the Scope step, which both modes keep. On the Schedule step
  // it was unreachable in run-now mode, so a run-now report was always a PDF.
  it.each(["schedule", "run-now"] as const)(
    "offers a format choice instead of silently forcing PDF in %s mode",
    (mode) => {
      render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode={mode} onClose={() => {}} />);
      expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
    },
  );

  it("disables the AI blocks when the org has no LLM key", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="schedule" onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText("Executive summary")).toBeDisabled();
  });

  it("run-now mode skips Schedule and Delivery and goes straight to Review", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={() => {}} />);

    expect(screen.queryByText("Schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("Delivery")).not.toBeInTheDocument();

    // Scope (org, no project needed) -> Sections -> AI Insights -> Review
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(screen.getByRole("heading", { name: /review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument();

    // runTemplateNow hardcodes delivery_config to { saveToStorage: true }
    // server-side — no email link is ever sent, so Review must not claim one is.
    expect(screen.queryByText(/Delivery:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Schedule:/)).not.toBeInTheDocument();
  });

  it("runs the template now through useRunTemplateNow when mode is run-now", () => {
    const onClose = vi.fn();
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} mode="run-now" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    expect(runNowMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TEMPLATE_FIXTURE.id,
        body: expect.objectContaining({ templateVersionId: TEMPLATE_FIXTURE.latestVersion.id }),
      }),
      expect.anything(),
    );
  });
});
