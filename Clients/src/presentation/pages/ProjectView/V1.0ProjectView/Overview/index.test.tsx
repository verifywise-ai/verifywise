import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import { Project } from "../../../../../domain/types/Project";
import VWProjectOverview from "./index";

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
