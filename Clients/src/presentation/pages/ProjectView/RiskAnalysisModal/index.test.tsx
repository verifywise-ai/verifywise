import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockUpdateProject = vi.fn();
vi.mock("../../../../application/repository/project.repository", () => ({
  updateProject: (...args: any[]) => mockUpdateProject(...args),
}));

import RiskAnalysisModal from "./index";

const noop = () => {};

const answerAllQuestions = async () => {
  // Q1 -> pick "conversational_assistance" (no conditional follow-up)
  fireEvent.click(
    screen.getByLabelText("Provide conversational assistance without making decisions about people"),
  );
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Q1d
  await screen.findByText(/safety component/i);
  fireEvent.click(screen.getByLabelText("No"));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Q2 (multi-select)
  await screen.findByText(/who will be affected/i);
  fireEvent.click(screen.getByLabelText("General public"));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Q3
  await screen.findByText(/who is deploying this system/i);
  fireEvent.click(screen.getByLabelText("Private sector organisation"));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Q4
  await screen.findByText(/how will the ai's output be used/i);
  fireEvent.click(screen.getByLabelText("Assistive tool, no decisions about people"));
  fireEvent.click(screen.getByRole("button", { name: /next/i }));

  // Q5
  await screen.findByText(/could the outcome affect a person's rights/i);
  fireEvent.click(screen.getByLabelText("No"));
};

describe("RiskAnalysisModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders the first question when opened", () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    expect(screen.getByText(/Q1\. What's the primary purpose/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("disables Next until the current question is answered", () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("navigates forward and shows the Back button once past the first question", async () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Research or prototype, not deployed to end users"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await screen.findByText(/safety component/i);
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("navigates back to the previous question", async () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Research or prototype, not deployed to end users"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    await screen.findByText(/safety component/i);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await screen.findByText(/Q1\. What's the primary purpose/);
  });

  it("shows conditional follow-up question for decisions_about_people", async () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Make or support decisions about people"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(await screen.findByText(/in which domain are those decisions made/i)).toBeInTheDocument();
  });

  it("shows the classification result after answering all questions", async () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    await answerAllQuestions();
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save results/i })).toBeInTheDocument();
    });
  });

  it("restarts the assessment and clears saved progress", async () => {
    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    await answerAllQuestions();
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    await screen.findByRole("button", { name: /save results/i });

    fireEvent.click(screen.getByRole("button", { name: /start new assessment/i }));

    await screen.findByText(/Q1\. What's the primary purpose/);
    expect(localStorage.getItem("riskAnalysis_42")).toBeNull();
  });

  it("saves classification, shows a success alert, and closes the modal", async () => {
    mockUpdateProject.mockResolvedValue({ status: 202 });
    const setAlert = vi.fn();
    const setIsOpen = vi.fn();
    const updateClassification = vi.fn();

    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={setIsOpen}
        projectId="42"
        setAlert={setAlert}
        updateClassification={updateClassification}
      />,
    );

    await answerAllQuestions();
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    await screen.findByRole("button", { name: /save results/i });

    fireEvent.click(screen.getByRole("button", { name: /save results/i }));

    await waitFor(() => {
      expect(mockUpdateProject).toHaveBeenCalled();
    });
    expect(mockUpdateProject.mock.calls[0][0]).toMatchObject({
      id: 42,
      body: { id: "42" },
    });

    await waitFor(() => {
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success", body: "Project updated successfully" }),
      );
    });
  });

  it("shows an error alert when saving fails with status 400", async () => {
    mockUpdateProject.mockResolvedValue({
      status: 400,
      data: { data: { message: "Could not update project" } },
    });
    const setAlert = vi.fn();

    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={setAlert}
        updateClassification={vi.fn()}
      />,
    );

    await answerAllQuestions();
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    await screen.findByRole("button", { name: /save results/i });

    fireEvent.click(screen.getByRole("button", { name: /save results/i }));

    await waitFor(() => {
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "error", body: "Could not update project" }),
      );
    });
  });

  it("loads saved progress from localStorage on mount", () => {
    localStorage.setItem(
      "riskAnalysis_42",
      JSON.stringify({ answers: { Q1: "data_analysis" }, currentQuestionId: "Q1d" }),
    );

    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    expect(screen.getByText(/safety component/i)).toBeInTheDocument();
  });

  it("ignores corrupt localStorage data without crashing", () => {
    localStorage.setItem("riskAnalysis_42", "not valid json");

    renderWithProviders(
      <RiskAnalysisModal
        isOpen={true}
        setIsOpen={noop}
        projectId="42"
        setAlert={vi.fn()}
        updateClassification={vi.fn()}
      />,
    );

    expect(screen.getByText(/Q1\. What's the primary purpose/)).toBeInTheDocument();
  });
});
