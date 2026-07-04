import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import WhatIfSimulator from "../WhatIfSimulator";
import type { IGovernanceScenario } from "../../../../domain/interfaces/i.governanceOs";

const mockScenarios: IGovernanceScenario[] = [
  {
    id: 1,
    name: "EU High-Risk AI Provider",
    priority_order: { primary: 1, secondary: [2], supplementary: [4] },
  },
];

describe("WhatIfSimulator", () => {
  it("renders Rough Estimate label instead of simulator", () => {
    renderWithProviders(
      <WhatIfSimulator
        scenarios={mockScenarios}
        result={null}
        isSimulating={false}
        error={null}
        onSimulate={vi.fn()}
      />,
    );
    expect(screen.getByText("Rough Estimate")).toBeInTheDocument();
    expect(screen.queryByText("What-If Simulator")).not.toBeInTheDocument();
  });

  it("shows disclaimer about heuristic estimates", () => {
    renderWithProviders(
      <WhatIfSimulator
        scenarios={mockScenarios}
        result={null}
        isSimulating={false}
        error={null}
        onSimulate={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/rough heuristic estimates based on simplified assumptions/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not predictive analytics/i)).toBeInTheDocument();
  });

  it("calls onSimulate when Run estimate is clicked", () => {
    const onSimulate = vi.fn();
    renderWithProviders(
      <WhatIfSimulator
        scenarios={mockScenarios}
        result={null}
        isSimulating={false}
        error={null}
        onSimulate={onSimulate}
      />,
    );

    // Select the base scenario so framework ids are populated and the run button is enabled.
    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(screen.getByText("EU High-Risk AI Provider"));

    fireEvent.click(screen.getByText("Run estimate"));
    expect(onSimulate).toHaveBeenCalled();
  });

  it("displays methodology disclaimer in results", () => {
    const result = {
      frameworkIds: [1, 2],
      totalControls: 200,
      estimatedCoveragePercent: 64,
      estimatedEffortHours: 800,
      timelineWeeks: 10,
      frameworkBreakdown: [],
      isHeuristicEstimate: true,
      methodology: {
        coverage: "estimatedCoveragePercent = min(85, 40 + 12 * frameworks)",
        effort: "estimatedEffortHours = totalControls * 4",
        timeline: "timelineWeeks = max(4, ceil(totalControls / 20))",
        disclaimer: "Test disclaimer",
      },
    };

    renderWithProviders(
      <WhatIfSimulator
        scenarios={mockScenarios}
        result={result}
        isSimulating={false}
        error={null}
        onSimulate={vi.fn()}
      />,
    );

    expect(screen.getByText("Rough estimate results")).toBeInTheDocument();
    expect(screen.getByText("Test disclaimer")).toBeInTheDocument();
    expect(screen.getByText("64%")).toBeInTheDocument();
    expect(screen.getByText("800 hrs")).toBeInTheDocument();
    expect(screen.getByText("10 wks")).toBeInTheDocument();
  });
});
