import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { light } from "../../../../../themes";
import GenerateReportFrom from "../index";

const WITH_FRAMEWORK = {
  id: 1,
  project_title: "Has framework",
  is_organizational: false,
  framework: [{ project_framework_id: 9, framework_id: 1, name: "EU AI Act" }],
};

const WITHOUT_FRAMEWORK = {
  id: 2,
  project_title: "No framework",
  is_organizational: false,
  framework: [],
};

vi.mock("../../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [WITH_FRAMEWORK, WITHOUT_FRAMEWORK], isLoading: false }),
}));

const NOTICE = /this use case has no framework assigned/i;

function renderForm(projectId: number | null) {
  const values = {
    project: projectId,
    framework: 0,
    projectFrameworkId: 0,
    reportName: "",
    format: "pdf" as const,
    aiEnhanced: false,
  };

  return render(
    <ThemeProvider theme={light}>
      <GenerateReportFrom reportType="project" values={values} onValuesChange={vi.fn()} />
    </ThemeProvider>,
  );
}

describe("GenerateReportFrom — no-framework notice", () => {
  it("warns before generation when the selected use case has no framework", () => {
    renderForm(WITHOUT_FRAMEWORK.id);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
  });

  it("stays hidden when the use case has a framework", () => {
    renderForm(WITH_FRAMEWORK.id);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("stays hidden before any use case is selected", () => {
    renderForm(null);
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
