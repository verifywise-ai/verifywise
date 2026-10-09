import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EuAiActStepToggle from "../EuAiActStepToggle";

const UNMAP_NOTE =
  "Turning this on unmaps the questions that set the AI risk classification and the high-risk role. They stay on the form; delete them so submitters are not asked twice.";

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
    expect(screen.queryByText(UNMAP_NOTE)).toBeNull();
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
    const note = screen.getByText(UNMAP_NOTE);
    const desc = screen.getByText(/^Submitters answer the EU AI Act risk questionnaire/);
    expect(note).not.toBe(desc);
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

  it("fires once when the checkbox itself is clicked", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <EuAiActStepToggle
        entityType="use_case"
        enabled={false}
        hasRiskMapping={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("fires once when the description row is clicked", () => {
    const onToggle = vi.fn();
    renderWithProviders(
      <EuAiActStepToggle
        entityType="use_case"
        enabled
        hasRiskMapping={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByText(/^Submitters answer/));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});
