import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EuAiActQuestionnaire from "..";
import type { Answers, Questionnaire } from "../../../../domain/types/euAiActClassification";

const Q: Questionnaire = {
  version: 2,
  questions: [
    {
      id: "scope",
      text: "Scope?",
      articleRef: "Art 2",
      inputType: "single_select",
      options: [
        { value: "research_only", label: "Research" },
        { value: "in_scope", label: "In scope" },
      ],
    },
    {
      id: "role",
      text: "Role?",
      articleRef: "Art 3",
      inputType: "single_select",
      options: [{ value: "provider", label: "Provider" }],
      showWhen: [[{ questionId: "scope", anyOf: ["in_scope"] }]],
    },
  ],
};

const MULTI: Questionnaire = {
  version: 2,
  questions: [
    {
      id: "practices",
      text: "Practices?",
      articleRef: "Art 5",
      inputType: "multi_select",
      options: [
        { value: "manipulation", label: "Manipulation" },
        { value: "scoring", label: "Scoring" },
        { value: "none", label: "None of these", exclusive: true },
      ],
    },
  ],
};

function Harness({
  questionnaire = Q,
  initial = {},
  onComplete,
  onChange,
}: {
  questionnaire?: Questionnaire;
  initial?: Answers;
  onComplete: (answers: Answers) => void;
  onChange?: (answers: Answers) => void;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  return (
    <EuAiActQuestionnaire
      questionnaire={questionnaire}
      answers={answers}
      onAnswersChange={(a) => {
        setAnswers(a);
        onChange?.(a);
      }}
      onComplete={() => onComplete(answers)}
      completeLabel="Continue"
    />
  );
}

describe("EuAiActQuestionnaire", () => {
  it("completes after the only visible question for a research-only system", () => {
    const onComplete = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} />);
    fireEvent.click(screen.getByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onComplete).toHaveBeenCalledWith({ scope: "research_only" });
  });

  it("walks to the follow-up question and back", () => {
    renderWithProviders(<Harness onComplete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("In scope"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Role?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Scope?")).toBeTruthy();
  });

  it("disables the button until the question is answered", () => {
    renderWithProviders(<Harness onComplete={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("drops answers to follow-ups that become hidden after going back and changing an answer", () => {
    const onComplete = vi.fn();
    renderWithProviders(<Harness onComplete={onComplete} />);
    fireEvent.click(screen.getByLabelText("In scope"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByLabelText("Provider"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onComplete).toHaveBeenCalledWith({ scope: "research_only" });
  });

  it("exposes the options as a labelled radio group", () => {
    renderWithProviders(<Harness onComplete={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "Scope?" })).toBeTruthy();
  });

  it("clears other choices when an exclusive option is selected", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness
        questionnaire={MULTI}
        initial={{ practices: ["manipulation", "scoring"] }}
        onComplete={vi.fn()}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("None of these"));
    expect(onChange).toHaveBeenLastCalledWith({ practices: ["none"] });
  });

  it("removes the exclusive option when another choice is selected", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness
        questionnaire={MULTI}
        initial={{ practices: ["none"] }}
        onComplete={vi.fn()}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Scoring"));
    expect(onChange).toHaveBeenLastCalledWith({ practices: ["scoring"] });
  });

  it("allows unchecking a multi-select choice", () => {
    const onChange = vi.fn();
    renderWithProviders(
      <Harness
        questionnaire={MULTI}
        initial={{ practices: ["manipulation", "scoring"] }}
        onComplete={vi.fn()}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText("Scoring"));
    expect(onChange).toHaveBeenLastCalledWith({ practices: ["manipulation"] });
  });
});
