import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

vi.mock("../../../../../application/hooks/useProjectRisks", () => ({
  default: () => ({
    projectRisksSummary: {
      total: 2,
      veryHighRisks: 0,
      highRisks: 2,
      mediumRisks: 0,
      lowRisks: 0,
      veryLowRisks: 0,
    },
  }),
}));

vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 7, name: "Ada", surname: "Lovelace" }] }),
}));

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: vi.fn().mockResolvedValue({ data: null }),
}));

import VWProjectOverview from "./index";
import type { Project } from "../../../../../domain/types/Project";

const project = {
  id: 3,
  project_title: "AI Recruitment Screening Platform",
  owner: 7,
  description: "An AI-powered platform.",
  last_updated: "2026-09-28",
  last_updated_by: 7,
  framework: [],
  members: [],
} as unknown as Project;

describe("ProjectOverview (V1.0ProjectView)", () => {
  it("links to this use case's risks tab", () => {
    renderWithProviders(<VWProjectOverview project={project} />, {
      route: "/project-view?projectId=3",
    });

    expect(
      screen.getByRole("link", { name: /view and add risks for this use case/i }),
    ).toHaveAttribute("href", "/project-view?projectId=3&tab=project-risks");
  });

  it("links to the risk management page", () => {
    renderWithProviders(<VWProjectOverview project={project} />, {
      route: "/project-view?projectId=3",
    });

    expect(
      screen.getByRole("link", { name: /manage all organization risks in risk management/i }),
    ).toHaveAttribute("href", "/risk-management");
  });
});
