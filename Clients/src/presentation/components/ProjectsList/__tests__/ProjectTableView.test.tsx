import { vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../../application/hooks/useCustomFields", () => ({
  useCustomFieldDefinitions: () => ({ data: [] }),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));
vi.mock("../../../../application/repository/project.repository", () => ({
  deleteProject: vi.fn(),
}));
vi.mock("../../ViewRelationshipsButton", () => ({
  default: () => null,
}));
vi.mock("../../IconButton", () => ({
  default: () => null,
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProjectTableView, { getRiskSortValue } from "../ProjectTableView";
import { Project } from "../../../../domain/types/Project";

const makeProject = (id: number, overrides: Partial<Project> = {}): Project =>
  ({
    id,
    uc_id: `UC-${id}`,
    project_title: `Use case ${id}`,
    ai_risk_classification: "Minimal risk",
    high_risk_roles: [],
    start_date: new Date("2026-01-01"),
    last_updated: new Date("2026-01-02"),
    owner: 1,
    ...overrides,
  }) as unknown as Project;

describe("ProjectTableView", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ranks Prohibited above High risk when sorting by risk level", () => {
    expect(getRiskSortValue("Prohibited")).toBeGreaterThan(getRiskSortValue("High risk"));
    expect(getRiskSortValue("High risk")).toBeGreaterThan(getRiskSortValue("Limited risk"));
    expect(getRiskSortValue("Limited risk")).toBeGreaterThan(getRiskSortValue("Minimal risk"));
    expect(getRiskSortValue("Minimal risk")).toBeGreaterThan(getRiskSortValue("Out of scope"));
    expect(getRiskSortValue(null)).toBe(0);
  });

  it("shows the no-match message instead of the getting-started guidance when filtered", () => {
    renderWithProviders(
      <ProjectTableView projects={[]} emptyMessage="No use cases match your search or filters." />,
    );
    expect(screen.getByText("No use cases match your search or filters.")).toBeInTheDocument();
    expect(screen.queryByText(/No use cases yet/)).not.toBeInTheDocument();
  });

  it("shows the getting-started guidance when there are no use cases at all", () => {
    renderWithProviders(<ProjectTableView projects={[]} />);
    expect(screen.getByText(/No use cases yet/)).toBeInTheDocument();
  });

  it("sorts from the keyboard and reports the direction with aria-sort", () => {
    renderWithProviders(
      <ProjectTableView
        projects={[
          makeProject(1, { ai_risk_classification: "Minimal risk" } as unknown as Partial<Project>),
          makeProject(2, { ai_risk_classification: "Prohibited" } as unknown as Partial<Project>),
        ]}
      />,
    );
    const riskHeader = screen.getByText("AI risk level").closest("th")!;
    expect(riskHeader).toHaveAttribute("tabindex", "0");
    expect(riskHeader).not.toHaveAttribute("aria-sort");

    fireEvent.keyDown(riskHeader, { key: "Enter" });
    expect(riskHeader).toHaveAttribute("aria-sort", "ascending");

    fireEvent.keyDown(riskHeader, { key: " " });
    expect(riskHeader).toHaveAttribute("aria-sort", "descending");

    const rows = screen.getAllByRole("button").filter((el) => el.tagName === "TR");
    expect(within(rows[0]).getByText("UC-2")).toBeInTheDocument();
  });

  it("returns to the last page that has rows when the list shrinks", () => {
    const many = Array.from({ length: 12 }, (_, i) => makeProject(i + 1));
    const { rerender } = renderWithProviders(<ProjectTableView projects={many} />);

    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByText("UC-11")).toBeInTheDocument();

    rerender(<ProjectTableView projects={many.slice(0, 3)} />);
    expect(screen.getByText("UC-1")).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 - 3 of 3/)).toBeInTheDocument();
  });
});
