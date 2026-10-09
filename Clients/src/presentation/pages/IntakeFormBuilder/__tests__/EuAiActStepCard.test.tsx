import { screen, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FormCanvas } from "../FormCanvas";
import type { Questionnaire } from "../../../../domain/types/euAiActClassification";

const QUESTIONNAIRE: Questionnaire = {
  version: 1,
  questions: [
    {
      id: "scope",
      text: "Is the system placed on the EU market?",
      articleRef: "Article 2",
      inputType: "single_select",
      options: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      id: "role",
      text: "What is your role?",
      articleRef: "Article 3",
      inputType: "single_select",
      options: [
        { value: "provider", label: "Provider" },
        { value: "deployer", label: "Deployer" },
      ],
      showWhen: [[{ questionId: "scope", anyOf: ["yes"] }]],
    },
    {
      id: "annex_iii_areas",
      text: "Which areas does the system work in?",
      articleRef: "Annex III",
      inputType: "multi_select",
      options: [
        { value: "biometrics", label: "Biometrics", description: "Identifying people" },
        { value: "none", label: "None of these", exclusive: true },
      ],
    },
    {
      id: "biometrics_use",
      text: "How is biometrics used?",
      articleRef: "Annex III point 1",
      inputType: "single_select",
      options: [{ value: "remote", label: "Remote identification" }],
      showWhen: [[{ questionId: "annex_iii_areas", anyOf: ["biometrics"] }]],
    },
    {
      id: "future_question",
      text: "A question from a newer version",
      articleRef: "Article 99",
      inputType: "single_select",
      options: [{ value: "a", label: "A" }],
    },
  ],
};

const mockGetQuestionnaire = vi.fn();
vi.mock("../../../../application/repository/euAiActClassification.repository", () => ({
  getEuAiActQuestionnaire: () => mockGetQuestionnaire(),
}));

const renderCanvas = (euAiActRiskStepEnabled: boolean) =>
  renderWithProviders(
    <FormCanvas
      fields={[]}
      selectedFieldId={null}
      onSelectField={vi.fn()}
      onDeleteField={vi.fn()}
      onDuplicateField={vi.fn()}
      onMoveUp={vi.fn()}
      onMoveDown={vi.fn()}
      formName="Form"
      formDescription=""
      euAiActRiskStepEnabled={euAiActRiskStepEnabled}
    />,
  );

describe("EU AI Act step card in the builder canvas", () => {
  beforeEach(() => {
    mockGetQuestionnaire.mockReset();
    mockGetQuestionnaire.mockResolvedValue(QUESTIONNAIRE);
  });

  it("shows the step card when the step is on", async () => {
    renderCanvas(true);
    expect(screen.getByText("EU AI Act risk classification")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Submitters answer these questions first. The result is shown only to reviewers.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/\(5\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View questions" })).toBeInTheDocument();
  });

  it("hides the step card when the step is off", () => {
    renderCanvas(false);
    expect(screen.queryByTestId("eu-ai-act-step-card")).not.toBeInTheDocument();
    expect(mockGetQuestionnaire).not.toHaveBeenCalled();
  });

  it("does not list the questions inline", async () => {
    renderCanvas(true);
    await screen.findByText(/\(5\)/);
    expect(screen.queryByTestId("eu-ai-act-step-question")).not.toBeInTheDocument();
  });

  it("opens the questions read-only in a drawer grouped by section", async () => {
    renderCanvas(true);
    await screen.findByText(/\(5\)/);
    fireEvent.click(screen.getByRole("button", { name: "View questions" }));

    const drawer = await screen.findByRole("dialog", { name: "EU AI Act questionnaire" });
    expect(within(drawer).getAllByTestId("eu-ai-act-step-question")).toHaveLength(5);
    expect(within(drawer).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(drawer).getByText("asked before the form")).toBeInTheDocument();

    const sections = within(drawer).getAllByTestId("eu-ai-act-question-section");
    expect(sections.map((s) => within(s).getByRole("heading").textContent)).toEqual([
      "Scope and role",
      "Annex III · High-risk uses",
      "Other questions",
    ]);
    expect(within(sections[0]).getByText("What is your role?")).toBeInTheDocument();
    expect(within(sections[1]).getByText("How is biometrics used?")).toBeInTheDocument();
    expect(within(sections[1]).getByText("Select all that apply")).toBeInTheDocument();
    expect(within(sections[1]).getByText("Identifying people")).toBeInTheDocument();
    expect(within(sections[2]).getByText("A question from a newer version")).toBeInTheDocument();
  });

  it("shows which earlier answer makes a follow-up question appear", async () => {
    renderCanvas(true);
    await screen.findByText(/\(5\)/);
    fireEvent.click(screen.getByRole("button", { name: "View questions" }));

    const drawer = await screen.findByRole("dialog");
    const rules = within(drawer).getAllByTestId("eu-ai-act-follow-up-rule");
    expect(rules).toHaveLength(2);
    expect(within(rules[1]).getByText("Shown when")).toBeInTheDocument();
    expect(within(rules[1]).getByText("Biometrics")).toBeInTheDocument();
  });

  it("closes the drawer with Escape and with the close button", async () => {
    renderCanvas(true);
    await screen.findByText(/\(5\)/);
    fireEvent.click(screen.getByRole("button", { name: "View questions" }));
    const drawer = await screen.findByRole("dialog");
    fireEvent.keyDown(drawer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "View questions" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a short line when the questions cannot be loaded and retries from the drawer", async () => {
    mockGetQuestionnaire.mockRejectedValue(new Error("network"));
    renderCanvas(true);
    expect(await screen.findByText("The questions could not be loaded.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View questions" }));
    const drawer = await screen.findByRole("dialog");
    mockGetQuestionnaire.mockResolvedValue(QUESTIONNAIRE);
    fireEvent.click(within(drawer).getByRole("button", { name: "Try again" }));
    expect(await within(drawer).findByText("What is your role?")).toBeInTheDocument();
  });
});
