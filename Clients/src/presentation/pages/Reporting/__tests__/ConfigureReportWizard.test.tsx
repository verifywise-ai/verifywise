import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../../../application/hooks/useReporting", () => ({
  useCreateScheduledReport: () => ({ mutate: vi.fn(), isPending: false }),
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
  it("shows scope step and disables next when project scope has no project", () => {
    render(
      <ConfigureReportWizard
        template={{
          id: 1,
          name: "Daily",
          latestVersion: { sections_config: { sections: [] }, ai_blocks_config: {} },
        }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Scope/i)).toBeInTheDocument();
  });

  it("offers all seven AI blocks, not the legacy three", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
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
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.queryByText("executiveSummary")).not.toBeInTheDocument();
  });

  it("offers a format choice instead of silently forcing PDF", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
  });

  it("disables the AI blocks when the org has no LLM key", () => {
    render(<ConfigureReportWizard template={TEMPLATE_FIXTURE} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByLabelText("Executive summary")).toBeDisabled();
  });
});
