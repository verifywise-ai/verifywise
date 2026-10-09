import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CustomException from "../../../../infrastructure/exceptions/customeException";

const { Q, repo } = vi.hoisted(() => {
  const Q = {
    version: 2,
    questions: [
      {
        id: "scope",
        text: "Scope?",
        articleRef: "Article 2(6) and 2(8)",
        inputType: "single_select",
        options: [
          { value: "research_only", label: "Research" },
          { value: "in_scope", label: "In scope" },
        ],
      },
    ],
  };
  return {
    Q,
    repo: {
      getEuAiActQuestionnaire: vi.fn(),
      getLatestUseCaseClassification: vi.fn(),
      scoreEuAiActAnswers: vi.fn(),
      saveUseCaseClassification: vi.fn(),
    },
  };
});
vi.mock("../../../../application/repository/euAiActClassification.repository", () => repo);

import RiskAnalysisModal from "./index";

const noop = () => {};

const renderModal = (overrides: Partial<React.ComponentProps<typeof RiskAnalysisModal>> = {}) =>
  renderWithProviders(
    <RiskAnalysisModal
      isOpen={true}
      setIsOpen={noop}
      projectId="12"
      setAlert={vi.fn()}
      updateClassification={vi.fn()}
      {...overrides}
    />,
  );

describe("RiskAnalysisModal", () => {
  beforeEach(() => {
    localStorage.clear(); // the draft key would otherwise leak between tests
    vi.clearAllMocks();
    repo.getEuAiActQuestionnaire.mockResolvedValue(Q);
    repo.getLatestUseCaseClassification.mockResolvedValue(null);
    repo.scoreEuAiActAnswers.mockResolvedValue({
      questionnaireVersion: 2,
      level: "Out of scope",
      role: null,
      reasons: [{ article: "Article 2(6) and 2(8)", text: "Outside scope." }],
      obligations: [],
    });
    repo.saveUseCaseClassification.mockResolvedValue({
      run: { id: 1 },
      result: { level: "Out of scope", role: null },
    });
  });

  it("loads the questionnaire and pre-fills the latest run's answers", async () => {
    repo.getLatestUseCaseClassification.mockResolvedValue({ answers: { scope: "research_only" } });
    renderModal();
    const option = await screen.findByLabelText("Research");
    await waitFor(() => expect(option).toBeChecked());
  });

  it("shows the server result with reasons after View results", async () => {
    renderModal();
    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    expect(await screen.findByText("Outside the EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("Article 2(6) and 2(8)")).toBeInTheDocument();
    expect(repo.scoreEuAiActAnswers).toHaveBeenCalledWith({ scope: "research_only" });
  });

  it("saves through the classification endpoint and reports the new level", async () => {
    const updateClassification = vi.fn();
    renderModal({ updateClassification });
    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    fireEvent.click(await screen.findByRole("button", { name: /save results/i }));
    await waitFor(() =>
      expect(repo.saveUseCaseClassification).toHaveBeenCalledWith(12, { scope: "research_only" }),
    );
    await waitFor(() =>
      expect(updateClassification).toHaveBeenCalledWith(
        expect.objectContaining({ level: "Out of scope", role: null }),
      ),
    );
  });

  it("disables Start new assessment while saving", async () => {
    repo.saveUseCaseClassification.mockReturnValue(new Promise(() => {}));
    renderModal();
    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    fireEvent.click(await screen.findByRole("button", { name: /save results/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /start new assessment/i })).toBeDisabled(),
    );
  });

  const saveAndGetAlert = async () => {
    const setAlert = vi.fn();
    const updateClassification = vi.fn();
    renderModal({ setAlert, updateClassification });
    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    fireEvent.click(await screen.findByRole("button", { name: /save results/i }));
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })),
    );
    expect(updateClassification).not.toHaveBeenCalled();
    return setAlert.mock.calls[0][0];
  };

  it("shows the server's message when the save is rejected with a 4xx", async () => {
    const message =
      "The EU AI Act risk classification requires the EU AI Act framework on this use case";
    repo.saveUseCaseClassification.mockRejectedValue(
      new CustomException(message, 400, {
        message: "Bad Request",
        data: { message, code: "AI_RISK_WITHOUT_EU_AI_ACT" },
      }),
    );
    expect((await saveAndGetAlert()).body).toBe(message);
  });

  // A 404 envelope with an empty `data` object leaves only the status phrase as
  // the exception's message.
  it.each([
    ["Not Found", 404, { message: "Not Found", data: {} }],
    ["Bad Request", 400, { message: "Bad Request", data: {} }],
    ["Payload Too Large", 413, { message: "Payload Too Large" }],
    ["Request failed with status code 404", 404, undefined],
    ["", 400, { data: "" }],
  ])("shows a generic message when a 4xx carries only %j", async (message, status, body) => {
    repo.saveUseCaseClassification.mockRejectedValue(new CustomException(message, status, body));
    expect((await saveAndGetAlert()).body).toBe("Could not save the classification. Try again.");
  });

  it("shows a generic message when the save fails with a 5xx", async () => {
    repo.saveUseCaseClassification.mockRejectedValue(
      new CustomException("Internal Server Error", 500, { data: "boom" }),
    );
    expect((await saveAndGetAlert()).body).toBe("Could not save the classification. Try again.");
  });

  it("shows a generic message when the save fails without a response", async () => {
    repo.saveUseCaseClassification.mockRejectedValue(new Error("Network Error"));
    expect((await saveAndGetAlert()).body).toBe("Could not save the classification. Try again.");
  });

  it("shows the questionnaire again when reopened after viewing results", async () => {
    const props = {
      setIsOpen: noop,
      projectId: "12",
      setAlert: vi.fn(),
      updateClassification: vi.fn(),
    };
    const { rerender } = renderWithProviders(<RiskAnalysisModal isOpen={true} {...props} />);
    fireEvent.click(await screen.findByLabelText("Research"));
    fireEvent.click(screen.getByRole("button", { name: /view results/i }));
    expect(await screen.findByText("Outside the EU AI Act")).toBeInTheDocument();
    rerender(<RiskAnalysisModal isOpen={false} {...props} />);
    rerender(<RiskAnalysisModal isOpen={true} {...props} />);
    expect(await screen.findByLabelText("Research")).toBeInTheDocument();
    expect(screen.queryByText("Outside the EU AI Act")).not.toBeInTheDocument();
  });

  it("shows an error when the questionnaire fails to load", async () => {
    repo.getEuAiActQuestionnaire.mockRejectedValue(new Error("boom"));
    renderModal();
    expect(
      await screen.findByText("Could not load the questionnaire. Try again later."),
    ).toBeInTheDocument();
  });
});
