import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import PMMQuestionEditor from "./QuestionEditor";
import type { PMMQuestion } from "../../../../domain/types/PostMarketMonitoring";

const existingQuestion: PMMQuestion = {
  id: 5,
  config_id: 1,
  question_text: "Is the model still performing as expected?",
  question_type: "yes_no",
  options: [],
  suggestion_text: "Escalate to the model owner",
  is_required: true,
  is_system_default: false,
  allows_flag_for_concern: true,
  display_order: 0,
  eu_ai_act_article: "Article 9",
};

describe("PMMQuestionEditor", () => {
  it("shows 'Add question' title when creating a new question", () => {
    renderWithProviders(
      <PMMQuestionEditor isOpen={true} onClose={vi.fn()} onSave={vi.fn()} question={null} />,
    );
    expect(screen.getByText("Add question")).toBeInTheDocument();
  });

  it("shows 'Edit question' title and pre-fills fields when editing", () => {
    renderWithProviders(
      <PMMQuestionEditor
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        question={existingQuestion}
      />,
    );

    expect(screen.getByText("Edit question")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Is the model still performing as expected?"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Escalate to the model owner")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Article 9")).toBeInTheDocument();
  });

  it("shows a validation error when saving with empty question text", async () => {
    renderWithProviders(
      <PMMQuestionEditor isOpen={true} onClose={vi.fn()} onSave={vi.fn()} question={null} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Question text is required")).toBeInTheDocument();
  });

  it("saves a new yes/no question with trimmed values", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <PMMQuestionEditor isOpen={true} onClose={vi.fn()} onSave={onSave} question={null} />,
    );

    fireEvent.change(document.querySelector("#question-text")!, {
      target: { value: "  Is data drift monitored?  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          question_text: "Is data drift monitored?",
          question_type: "yes_no",
          options: [],
          is_required: true,
          allows_flag_for_concern: true,
        }),
      );
    });
  });

  it("shows the options editor for multi_select questions and requires at least 2", async () => {
    renderWithProviders(
      <PMMQuestionEditor isOpen={true} onClose={vi.fn()} onSave={vi.fn()} question={null} />,
    );

    fireEvent.change(document.querySelector("#question-text")!, {
      target: { value: "Pick an option" },
    });

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Multiple choice" }));

    expect(screen.getByText("Options *")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("At least 2 options are required for multiple choice"),
    ).toBeInTheDocument();
  });

  it("adds, edits, and removes options for a multi_select question", async () => {
    renderWithProviders(
      <PMMQuestionEditor isOpen={true} onClose={vi.fn()} onSave={vi.fn()} question={null} />,
    );

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.mouseDown(comboboxes[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Multiple choice" }));

    fireEvent.click(screen.getByText("Add option"));
    fireEvent.click(screen.getByText("Add option"));
    const optionInputs = screen.getAllByRole("textbox").filter((el) => el.id.startsWith("option-"));
    expect(optionInputs).toHaveLength(2);

    fireEvent.change(optionInputs[0], { target: { value: "Yes, fully" } });
    expect(screen.getByDisplayValue("Yes, fully")).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: "" });
    fireEvent.click(removeButtons[removeButtons.length - 1]);
    expect(screen.getAllByRole("textbox").filter((el) => el.id.startsWith("option-"))).toHaveLength(
      1,
    );
  });

  it("resets the form when switching from editing to creating a new question", () => {
    const { rerender } = renderWithProviders(
      <PMMQuestionEditor
        isOpen={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        question={existingQuestion}
      />,
    );

    expect(
      screen.getByDisplayValue("Is the model still performing as expected?"),
    ).toBeInTheDocument();

    rerender(
      <PMMQuestionEditor isOpen={true} onClose={vi.fn()} onSave={vi.fn()} question={null} />,
    );

    expect(
      screen.queryByDisplayValue("Is the model still performing as expected?"),
    ).not.toBeInTheDocument();
  });
});
