import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EuAiActClassificationPanel from "../EuAiActClassificationPanel";
import type { EuAiActClassificationData } from "../EuAiActClassificationPanel";

const classification: EuAiActClassificationData = {
  questionnaire: {
    version: 1,
    questions: [
      {
        id: "q_domain",
        text: "Which area does the system operate in?",
        articleRef: "Annex III",
        inputType: "multi_select",
        options: [
          { value: "employment", label: "Employment and HR" },
          { value: "education", label: "Education" },
        ],
      },
      {
        id: "q_role",
        text: "What is your role?",
        articleRef: "Art. 3",
        inputType: "single_select",
        options: [{ value: "provider", label: "Provider of the system" }],
      },
      {
        id: "q_hidden",
        text: "Hidden follow-up question",
        articleRef: "Art. 5",
        inputType: "single_select",
        options: [{ value: "x", label: "X" }],
        showWhen: [[{ questionId: "q_domain", anyOf: ["education"] }]],
      },
    ],
  },
  answers: { q_domain: ["employment"], q_role: "provider" },
  role: "Provider",
  current: {
    questionnaireVersion: 1,
    level: "High risk",
    role: "Provider",
    reasons: [
      {
        article: "Annex III(4)",
        text: "Employment systems are high risk.",
        appliesFrom: "2027-12-02",
      },
    ],
    obligations: [],
  },
  changedSinceSubmission: false,
  submittedAt: "2026-10-01T00:00:00.000Z",
};

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof EuAiActClassificationPanel>> = {},
) {
  return renderWithProviders(
    <EuAiActClassificationPanel
      classification={classification}
      isPending
      selectedLevel="High risk"
      onLevelChange={vi.fn()}
      justification=""
      onJustificationChange={vi.fn()}
      {...overrides}
    />,
  );
}

describe("EuAiActClassificationPanel", () => {
  it("shows level, reasons, role and answered questions with option labels", () => {
    renderPanel();
    expect(screen.getByText("EU AI Act classification")).toBeInTheDocument();
    expect(screen.getAllByText("High risk").length).toBeGreaterThan(0);
    expect(screen.getByText("Annex III(4)")).toBeInTheDocument();
    expect(screen.getByText("Employment systems are high risk.")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("Applies from")).toBeInTheDocument();
    expect(screen.getByText("2 Dec 2027")).toBeInTheDocument();
    expect(screen.getByText("Which area does the system operate in?")).toBeInTheDocument();
    expect(screen.getByText("Employment and HR")).toBeInTheDocument();
    expect(screen.getByText("Provider of the system")).toBeInTheDocument();
    expect(screen.queryByText("Hidden follow-up question")).toBeNull();
  });

  it("shows the updated notice only when changed since submission", () => {
    const { unmount } = renderPanel();
    expect(screen.queryByText("Updated since submission")).toBeNull();
    unmount();
    renderPanel({ classification: { ...classification, changedSinceSubmission: true } });
    expect(screen.getByText("Updated since submission")).toBeInTheDocument();
  });

  it("shows the justification field only when the level differs from the computed one", () => {
    const { unmount } = renderPanel({ selectedLevel: "High risk" });
    expect(document.getElementById("eu-ai-act-justification")).toBeNull();
    unmount();
    renderPanel({ selectedLevel: "Limited risk" });
    expect(document.getElementById("eu-ai-act-justification")).not.toBeNull();
  });

  it("flags a too-short justification", () => {
    renderPanel({ selectedLevel: "Limited risk", justification: "short" });
    expect(screen.getByText("Justification must be at least 10 characters")).toBeInTheDocument();
  });

  it("warns when Prohibited is selected", () => {
    const { unmount } = renderPanel({ selectedLevel: "High risk" });
    expect(screen.queryByText("Approving creates a use case classified as prohibited.")).toBeNull();
    unmount();
    renderPanel({ selectedLevel: "Prohibited" });
    expect(
      screen.getByText("Approving creates a use case classified as prohibited."),
    ).toBeInTheDocument();
  });

  it("offers exactly the five levels and reports a selection", () => {
    const onLevelChange = vi.fn();
    renderPanel({ onLevelChange });
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((o) => o.textContent?.trim())).toEqual([
      "Prohibited",
      "High risk",
      "Limited risk",
      "Minimal risk",
      "Out of scope",
    ]);
    fireEvent.click(options[2]);
    expect(onLevelChange).toHaveBeenCalledWith("Limited risk");
  });

  it("is read-only when not pending", () => {
    renderPanel({ isPending: false, selectedLevel: "Prohibited" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.getElementById("eu-ai-act-justification")).toBeNull();
    expect(screen.queryByText("Approving creates a use case classified as prohibited.")).toBeNull();
  });
});
