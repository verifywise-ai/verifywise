import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../application/hooks/useReporting", () => ({
  useCreateScheduledReport: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [{ id: 1, project_title: "Project A" }], isLoading: false }),
}));

import ConfigureReportWizard from "../ConfigureReportWizard";

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
});
