import { screen, fireEvent } from "@testing-library/react";
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
    expect(await screen.findByText(/\(2\)/)).toBeInTheDocument();
  });

  it("hides the step card when the step is off", () => {
    renderCanvas(false);
    expect(screen.queryByTestId("eu-ai-act-step-card")).not.toBeInTheDocument();
    expect(mockGetQuestionnaire).not.toHaveBeenCalled();
  });

  it("lists the questions read-only when shown and marks follow-up questions", async () => {
    renderCanvas(true);
    fireEvent.click(await screen.findByRole("button", { name: "Show questions" }));

    expect(screen.getAllByTestId("eu-ai-act-step-question")).toHaveLength(2);
    expect(screen.getByText("Is the system placed on the EU market?")).toBeInTheDocument();
    expect(screen.getByText("Article 2")).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getAllByText("Asked depending on earlier answers")).toHaveLength(1);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide questions" }));
    expect(screen.queryByTestId("eu-ai-act-step-question")).not.toBeInTheDocument();
  });

  it("shows a short line when the questions cannot be loaded", async () => {
    mockGetQuestionnaire.mockRejectedValue(new Error("network"));
    renderCanvas(true);
    expect(await screen.findByText("The questions could not be loaded.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show questions" })).not.toBeInTheDocument();
  });
});
