import { screen, fireEvent } from "@testing-library/react";
import { runDrawerTests } from "../../../../../test/drawerTestFactory";
import EUAIActQuestionDrawerDialog from "../index";

const mockQuestion = {
  answer_id: 1,
  question_id: 1,
  question: "Test question?",
  answer: "",
  status: "Not started",
  hint: "Test hint",
  priority_level: "High",
  is_required: true,
  evidence_files: [],
  risks: [],
};

const mockSubtopic = {
  id: 1,
  topic_id: 1,
  title: "Test Subtopic",
};

runDrawerTests({
  name: "EUAIActQuestionDrawerDialog",
  Component: EUAIActQuestionDrawerDialog,
  props: {
    open: false,
    onClose: () => {},
    onSaveSuccess: () => {},
    question: mockQuestion,
    subtopic: mockSubtopic,
    currentProjectId: 1,
  },
  titleMatcher: "Test Subtopic",
  tabs: ["details", "evidence", "cross-mappings", "notes"],
  hasSelectFields: true,
  hasDatePicker: false,
  hasFieldInput: false,
  clickCloseButton: () => {
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(
      (btn) =>
        btn.querySelector("svg") && btn.closest("[class*='eu-ai-act-question-drawer-dialog']"),
    );
    if (closeBtn) fireEvent.click(closeBtn);
  },
});
