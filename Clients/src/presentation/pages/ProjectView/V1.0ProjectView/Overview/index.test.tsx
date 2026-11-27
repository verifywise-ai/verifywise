import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { Project } from "../../../../../domain/types/Project";
import VWProjectOverview from "./index";
import { getEntityById } from "../../../../../application/repository/entity.repository";

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Ada", surname: "Lovelace" }] }),
}));

vi.mock("../../../../../application/hooks/useProjectRisks", () => ({
  default: () => ({ projectRisksSummary: {} }),
}));

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: vi.fn().mockResolvedValue({ data: null }),
}));

const buildProject = (overrides: Partial<Project> = {}): Project =>
  ({
    id: 11,
    project_title: "Fraud scoring",
    owner: 1,
    members: [1],
    status: "Not started",
    last_updated: "2026-10-14T00:00:00.000Z",
    last_updated_by: 1,
    framework: [],
    ...overrides,
  }) as Project;

vi.mock("./LinkedAiAppsCard", () => ({
  default: () => <div data-testid="linked-ai-apps-card" />,
}));

describe("VWProjectOverview linked AI apps", () => {
  it("shows the card on a use case", () => {
    renderWithProviders(<VWProjectOverview project={buildProject()} />);
    expect(screen.getByTestId("linked-ai-apps-card")).toBeInTheDocument();
  });

  it("leaves the card off an organizational project", () => {
    renderWithProviders(<VWProjectOverview project={buildProject({ is_organizational: true })} />);
    expect(screen.queryByTestId("linked-ai-apps-card")).toBeNull();
  });
});

describe("VWProjectOverview approval banner", () => {
  it("explains why the tabs are disabled while the request is pending", () => {
    renderWithProviders(
      <VWProjectOverview project={buildProject({ approval_status: "pending" })} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/waiting for approval/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/the other tabs stay disabled/i);
  });

  it("says the use case can no longer be used once the request is rejected", () => {
    renderWithProviders(
      <VWProjectOverview project={buildProject({ approval_status: "rejected" })} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/rejected, so it can no longer be used/i);
  });

  it("shows no banner once the use case is approved", () => {
    renderWithProviders(<VWProjectOverview project={buildProject({ approval_status: null })} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("VWProjectOverview EU AI Act (organization) card", () => {
  beforeEach(() => {
    vi.mocked(getEntityById).mockClear();
  });

  const orgProject = () =>
    buildProject({
      is_organizational: true,
      framework: [
        { project_framework_id: 40, framework_id: 29, name: "EU AI Act (organization)" },
      ] as Project["framework"],
    });

  it("shows the EU AI Act card from the EU AI Act progress of the organization part", async () => {
    renderWithProviders(<VWProjectOverview project={orgProject()} />);

    expect(
      await screen.findByText("EU AI Act (organization) completion status"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getEntityById).toHaveBeenCalledWith({
        routeUrl: "/eu-ai-act/compliances/progress/40",
      }),
    );
    expect(getEntityById).toHaveBeenCalledWith({
      routeUrl: "/eu-ai-act/assessments/progress/40",
    });
  });

  it("doesn't ask the bundled-framework dashboard for it", async () => {
    renderWithProviders(<VWProjectOverview project={orgProject()} />);

    await screen.findByText("EU AI Act (organization) completion status");
    expect(getEntityById).not.toHaveBeenCalledWith({
      routeUrl: "/frameworks/29/dashboard/40",
    });
  });
});
