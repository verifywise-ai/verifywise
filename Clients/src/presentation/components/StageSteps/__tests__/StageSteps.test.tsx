import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StageSteps from "../index";
import { stage as tokens } from "../../../themes/palette";

const onBars = () =>
  screen.getAllByTestId("stage-step-bar").filter((b) => b.getAttribute("data-on") === "true");

describe("StageSteps", () => {
  it.each([
    ["in_review", 1, "In review"],
    ["planned", 2, "Planned"],
    ["live", 3, "Live"],
    ["retired", 4, "Retired"],
  ])("%s fills %i bars", (stage, n, label) => {
    render(<StageSteps stage={stage} />);
    expect(screen.getAllByTestId("stage-step-bar")).toHaveLength(4);
    expect(onBars()).toHaveLength(n);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByTestId("stage-steps")).toHaveAttribute("title", `Step ${n} of 4`);
    onBars().forEach((b) => expect(b).toHaveStyle({ backgroundColor: tokens.barOn }));
  });

  it("bars are 5x12 with 2px radius and empty bars use barOff", () => {
    render(<StageSteps stage="in_review" />);
    const bars = screen.getAllByTestId("stage-step-bar");
    expect(bars[0]).toHaveStyle({ width: "5px", height: "12px", borderRadius: "2px" });
    expect(bars[3]).toHaveStyle({ backgroundColor: tokens.barOff });
  });

  it("hides the bars from assistive tech", () => {
    render(<StageSteps stage="live" />);
    expect(screen.getAllByTestId("stage-step-bar")[0].parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("retired label uses the past colour, others the primary colour", () => {
    const { unmount } = render(<StageSteps stage="retired" />);
    expect(screen.getByTestId("stage-steps-label")).toHaveStyle({ color: tokens.textPast });
    unmount();
    render(<StageSteps stage="live" />);
    expect(screen.getByTestId("stage-steps-label")).toHaveStyle({ color: tokens.text });
  });

  it.each([[null], [undefined], ["bogus"]])("unknown %s shows 0 bars and raw text", (stage) => {
    render(<StageSteps stage={stage} />);
    expect(onBars()).toHaveLength(0);
    expect(screen.getByTestId("stage-steps-label")).toHaveTextContent(stage ?? "");
  });
});
