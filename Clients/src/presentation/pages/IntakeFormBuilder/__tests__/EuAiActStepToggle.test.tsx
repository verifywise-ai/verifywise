import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EuAiActStepToggle from "../EuAiActStepToggle";

const UNMAP_NOTE =
  "Turning this on unmaps the question that sets the AI risk classification. The question stays on the form.";

describe("EuAiActStepToggle", () => {
  it("renders nothing for model forms", () => {
    const { container } = renderWithProviders(
      <EuAiActStepToggle
        entityType="model"
        enabled={false}
        hasRiskMapping={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText("EU AI Act risk classification step")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("calls onToggle(true) when switched on without a risk mapping", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <EuAiActStepToggle
        entityType="use_case"
        enabled={false}
        hasRiskMapping={false}
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByText(new RegExp("unmaps the question"))).toBeNull();
    fireEvent.click(screen.getByText("EU AI Act risk classification step"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("warns about unmapping when a risk mapping exists and still toggles on", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <EuAiActStepToggle
        entityType="use_case"
        enabled={false}
        hasRiskMapping
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText(new RegExp(UNMAP_NOTE))).toBeTruthy();
    fireEvent.click(screen.getByText("EU AI Act risk classification step"));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("calls onToggle(false) when switched off", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <EuAiActStepToggle
        entityType="use_case"
        enabled
        hasRiskMapping={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText("EU AI Act risk classification step"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
