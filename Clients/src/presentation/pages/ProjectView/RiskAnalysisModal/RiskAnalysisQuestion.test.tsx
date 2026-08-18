import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskAnalysisQuestion from "./RiskAnalysisQuestion";
import type { IQuestion } from "./iQuestion";

const singleSelectQuestion: IQuestion = {
  id: "Q1",
  text: "What's the primary purpose of your AI system?",
  inputType: "single_select",
  isRequired: true,
  options: [
    { value: "opt_a", label: "Option A" },
    { value: "opt_b", label: "Option B" },
  ],
};

const multiSelectQuestion: IQuestion = {
  id: "Q2",
  text: "Who will be affected?",
  inputType: "multi_select",
  isRequired: true,
  options: [
    { value: "employees", label: "Employees" },
    { value: "consumers", label: "Consumers" },
  ],
};

describe("RiskAnalysisQuestion", () => {
  it("renders the question id and text", () => {
    renderWithProviders(
      <RiskAnalysisQuestion question={singleSelectQuestion} onSelect={vi.fn()} answers={{}} />,
    );
    expect(
      screen.getByText("Q1. What's the primary purpose of your AI system?"),
    ).toBeInTheDocument();
  });

  it("renders radio options for single_select questions and reflects the current answer", () => {
    renderWithProviders(
      <RiskAnalysisQuestion
        question={singleSelectQuestion}
        onSelect={vi.fn()}
        answers={{ Q1: "opt_b" }}
      />,
    );

    expect(screen.getByLabelText("Option B")).toBeChecked();
    expect(screen.getByLabelText("Option A")).not.toBeChecked();
  });

  it("calls onSelect with the option value when a radio option is clicked", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <RiskAnalysisQuestion question={singleSelectQuestion} onSelect={onSelect} answers={{}} />,
    );

    fireEvent.click(screen.getByLabelText("Option A"));
    expect(onSelect).toHaveBeenCalledWith("Q1", "opt_a");
  });

  it("renders checkboxes for multi_select questions and reflects selected values", () => {
    renderWithProviders(
      <RiskAnalysisQuestion
        question={multiSelectQuestion}
        onSelect={vi.fn()}
        answers={{ Q2: ["employees"] }}
      />,
    );

    expect(screen.getByLabelText("Employees")).toBeChecked();
    expect(screen.getByLabelText("Consumers")).not.toBeChecked();
  });

  it("adds a value to the selection when a checkbox is checked", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <RiskAnalysisQuestion
        question={multiSelectQuestion}
        onSelect={onSelect}
        answers={{ Q2: ["employees"] }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Consumers"));
    expect(onSelect).toHaveBeenCalledWith("Q2", ["employees", "consumers"]);
  });

  it("removes a value from the selection when a checked checkbox is unchecked", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <RiskAnalysisQuestion
        question={multiSelectQuestion}
        onSelect={onSelect}
        answers={{ Q2: ["employees", "consumers"] }}
      />,
    );

    fireEvent.click(screen.getByLabelText("Employees"));
    expect(onSelect).toHaveBeenCalledWith("Q2", ["consumers"]);
  });

  it("treats a non-array answer for a multi_select question as empty", () => {
    renderWithProviders(
      <RiskAnalysisQuestion
        question={multiSelectQuestion}
        onSelect={vi.fn()}
        answers={{ Q2: undefined }}
      />,
    );

    expect(screen.getByLabelText("Employees")).not.toBeChecked();
  });
});
