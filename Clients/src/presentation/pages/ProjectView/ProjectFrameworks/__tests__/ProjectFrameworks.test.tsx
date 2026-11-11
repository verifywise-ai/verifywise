import { act, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import type { Project } from "../../../../../domain/types/Project";

const FRAMEWORKS = [
  { id: "1", name: "EU AI Act" },
  { id: "2", name: "ISO 42001" },
  { id: "3", name: "ISO 27001" },
];

const readinessProps = vi.fn();
const genericFrameworkProps = vi.fn();
const buttonToggleProps = vi.fn();

vi.mock("../../../../../application/hooks/useFrameworks", () => ({
  default: () => ({
    filteredFrameworks: FRAMEWORKS,
    allFrameworks: FRAMEWORKS,
    loading: false,
    error: null,
    refreshFilteredFrameworks: vi.fn(),
  }),
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));

vi.mock("../../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));

vi.mock("../../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({ refs: [{ current: null }], allVisible: false }),
}));

vi.mock("../../../ComplianceTracker/1.0ComplianceTracker", () => ({
  default: () => <div data-testid="compliance-tracker" />,
}));

vi.mock("../../../Assessment/1.0AssessmentTracker", () => ({
  default: () => <div data-testid="assessment-tracker" />,
}));

vi.mock("../../../ReadinessDashboard", () => ({
  default: (props: any) => {
    readinessProps(props);
    return <div data-testid="readiness-dashboard" />;
  },
}));

vi.mock("../../../Framework/Generic", () => ({
  default: (props: any) => {
    genericFrameworkProps(props);
    return <div data-testid="generic-framework" />;
  },
}));

vi.mock("../../AddNewFramework", () => ({
  default: () => null,
}));

vi.mock("../../../../components/FrameworkFilter/TabFilterBar", () => ({
  TabFilterBar: () => null,
}));

vi.mock("../../../../components/button-toggle", () => ({
  ButtonToggle: (props: any) => {
    buttonToggleProps(props);
    return null;
  },
}));

import ProjectFrameworks from "../index";

const project = {
  id: 7,
  framework: FRAMEWORKS.map((fw) => ({
    project_framework_id: Number(fw.id),
    framework_id: Number(fw.id),
    name: fw.name,
  })),
} as unknown as Project;

const tabNames = () => screen.getAllByRole("tab").map((tab) => tab.textContent);

describe("ProjectFrameworks tracker tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers Requirements, Assessments and AI readiness for the EU AI Act", () => {
    renderWithProviders(<ProjectFrameworks project={project} initialFrameworkId={1} />);
    expect(tabNames()).toEqual(["Requirements", "Assessments", "AI readiness"]);
  });

  it("dispatches ISO 42001 to <GenericFramework/> without tracker tabs", () => {
    renderWithProviders(<ProjectFrameworks project={project} initialFrameworkId={2} />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByTestId("generic-framework")).toBeInTheDocument();
    expect(genericFrameworkProps).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 7, frameworkId: 2 }),
    );
  });

  it("dispatches ISO 27001 to <GenericFramework/> without tracker tabs", () => {
    renderWithProviders(<ProjectFrameworks project={project} initialFrameworkId={3} />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByTestId("generic-framework")).toBeInTheDocument();
    expect(genericFrameworkProps).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 7, frameworkId: 3 }),
    );
  });

  it("ignores ?subtab for non-EU-AI-Act frameworks (still dispatches to <GenericFramework/>)", () => {
    renderWithProviders(<ProjectFrameworks project={project} initialFrameworkId={2} />, {
      route: "/project-view?subtab=assessment",
    });
    expect(screen.getByTestId("generic-framework")).toBeInTheDocument();
    expect(screen.queryByTestId("compliance-tracker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("assessment-tracker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("readiness-dashboard")).not.toBeInTheDocument();
  });

  it("scopes the readiness dashboard to the EU AI Act use case via ?subtab=readiness", () => {
    renderWithProviders(<ProjectFrameworks project={project} initialFrameworkId={1} />, {
      route: "/project-view?subtab=readiness",
    });
    expect(screen.getByTestId("readiness-dashboard")).toBeInTheDocument();
    expect(readinessProps).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 7, frameworkType: "eu_ai_act" }),
    );
  });
});

describe("ProjectFrameworks imported frameworks", () => {
  const importedLinks = [
    { project_imported_framework_id: 40, imported_framework_id: 2, name: "Vendor checklist" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds imported frameworks to the toggle after the bundled ones", () => {
    renderWithProviders(
      <ProjectFrameworks
        project={{ ...project, imported_frameworks: importedLinks } as Project}
        initialFrameworkId={2}
      />,
    );
    const { options, value } = buttonToggleProps.mock.lastCall![0];
    expect(options).toEqual([
      { value: "0", label: "EU AI Act" },
      { value: "1", label: "ISO 42001" },
      { value: "2", label: "ISO 27001" },
      { value: "imp-40", label: "Vendor checklist" },
    ]);
    expect(value).toBe("1");
  });

  it("renders the imported framework through <GenericFramework source=imported/> when picked", () => {
    renderWithProviders(
      <ProjectFrameworks
        project={{ ...project, imported_frameworks: importedLinks } as Project}
        initialFrameworkId={1}
      />,
    );
    act(() => buttonToggleProps.mock.lastCall![0].onChange("imp-40"));

    expect(genericFrameworkProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: "imported", projectId: 7, linkId: 40 }),
    );
    // Readiness and assessment tabs belong to bundled frameworks only.
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(buttonToggleProps.mock.lastCall![0].value).toBe("imp-40");
  });

  it("opens the first imported framework when the use case has no bundled one", () => {
    renderWithProviders(
      <ProjectFrameworks
        project={{ ...project, framework: [], imported_frameworks: importedLinks } as Project}
      />,
    );
    expect(screen.queryByText("No frameworks installed")).not.toBeInTheDocument();
    expect(genericFrameworkProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: "imported", linkId: 40 }),
    );
  });
});
