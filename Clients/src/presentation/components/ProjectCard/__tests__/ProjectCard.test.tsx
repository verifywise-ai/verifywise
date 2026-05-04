import { vi } from "vitest";

vi.mock("../../../../application/hooks/useNavigateSearch", () => ({
  default: () => vi.fn(),
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({
    users: [
      { id: 1, name: "John", surname: "Doe" },
      { id: 2, name: "Jane", surname: "Smith" },
    ],
  }),
}));

vi.mock("../../../../application/tools/getProjectData", () => ({
  default: () => ({
    controlsProgress: "50%",
    requirementsProgress: "75%",
    controlsCompleted: 5,
    requirementsCompleted: 10,
  }),
}));

vi.mock("../../../tools/isoDateToString", () => ({
  displayFormattedDate: (_date: string) => "Jan 1, 2025",
}));

vi.mock("../../../assets/imgs/eu-ai-act.jpg", () => ({ default: "eu-ai-act.jpg" }));

vi.mock("../ProgressBar", () => ({
  default: ({ progress }: { progress: string }) => <div data-testid="progress-bar">{progress}</div>,
}));

vi.mock("../styles", () => ({
  Btn: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Card: ({ children }: any) => <div data-testid="project-card">{children}</div>,
  styles: {
    upperBox: {},
    subtitle: {},
    progressBarTitle: {},
    lowerBox: {},
    imageBox: {},
    imageTitle: {},
  },
  SubtitleValue: ({ children }: any) => <span>{children}</span>,
  Title: ({ children }: any) => <h5>{children}</h5>,
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProjectCard from "../index";

describe("ProjectCard", () => {
  const defaultProps = {
    id: 1,
    project_title: "AI Governance Project",
    owner: "1",
    assessments: { percentageComplete: 0, allDoneAssessments: 0, allTotalAssessments: 0 },
    controls: { percentageComplete: 0, allDoneSubControls: 0, allTotalSubControls: 0 },
    last_updated: "2025-01-01T00:00:00Z",
  };

  it("renders the project title", () => {
    renderWithProviders(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("AI Governance Project")).toBeInTheDocument();
  });

  it("renders the project owner name", () => {
    renderWithProviders(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("John Doe")).toBeInTheDocument();
  });

  it("renders progress bars", () => {
    renderWithProviders(<ProjectCard {...defaultProps} />);
    const progressBars = screen.getAllByTestId("progress-bar");
    expect(progressBars).toHaveLength(2);
  });

  it("renders View project button", () => {
    renderWithProviders(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("View project")).toBeInTheDocument();
  });

  it("displays formatted last updated date", () => {
    renderWithProviders(<ProjectCard {...defaultProps} />);
    expect(screen.getByText("Jan 1, 2025")).toBeInTheDocument();
  });

  it("renders when owner is not found in users list", () => {
    // When owner ID doesn't match, ownerUser defaults to {} so name/surname are undefined
    renderWithProviders(<ProjectCard {...defaultProps} owner="999" />);
    expect(screen.getByText("AI Governance Project")).toBeInTheDocument();
  });
});
