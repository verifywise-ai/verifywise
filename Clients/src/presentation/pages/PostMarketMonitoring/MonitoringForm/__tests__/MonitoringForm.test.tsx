import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";

const mockNavigate = vi.fn();
const mockCycleId = "42";

vi.mock("react-router-dom", async () => {
  const actual: any = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ cycleId: mockCycleId }),
  };
});

const mockGetCycleById = vi.fn();
const mockGetQuestions = vi.fn();
const mockGetResponses = vi.fn();
const mockSaveResponses = vi.fn();
const mockSubmitCycle = vi.fn();

vi.mock("../../../../../infrastructure/api/postMarketMonitoringService", () => ({
  pmmService: {
    getCycleById: (...args: any[]) => mockGetCycleById(...args),
    getQuestions: (...args: any[]) => mockGetQuestions(...args),
    getResponses: (...args: any[]) => mockGetResponses(...args),
    saveResponses: (...args: any[]) => mockSaveResponses(...args),
    submitCycle: (...args: any[]) => mockSubmitCycle(...args),
  },
}));

vi.mock("../../../../components/breadcrumbs/PageBreadcrumbs", () => ({
  PageBreadcrumbs: () => <div data-testid="page-breadcrumbs" />,
}));

vi.mock("../../../../components/Alert", () => ({
  default: ({ variant, body, isToast, onClick }: any) => (
    <div data-testid="alert" data-variant={variant} data-toast={isToast} onClick={onClick}>
      {body}
    </div>
  ),
}));

vi.mock("../../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text, onClick, isDisabled, variant }: any) => (
    <button
      data-testid="customizable-button"
      data-variant={variant}
      onClick={onClick}
      disabled={isDisabled}
    >
      {text}
    </button>
  ),
}));

vi.mock("../../../../components/Inputs/Field", () => ({
  default: ({ value, onChange, id }: any) => (
    <textarea data-testid="field" data-field-id={id} value={value} onChange={onChange} />
  ),
}));

import MonitoringForm from "../index";

const mockCycle = {
  id: 42,
  config_id: 7,
  cycle_number: 3,
  status: "in_progress",
  started_at: "2026-01-15T00:00:00Z",
  due_at: "2026-06-15T00:00:00Z",
  project_id: 1,
  project_title: "AI Chatbot",
  is_overdue: false,
  days_until_due: 7,
};

const mockQuestions = [
  {
    id: 1,
    config_id: 7,
    question_text: "Is the model performing as expected?",
    question_type: "yes_no" as const,
    is_required: true,
    is_system_default: false,
    allows_flag_for_concern: true,
    display_order: 1,
    suggestion_text: "If not, consider retraining the model.",
    eu_ai_act_article: "Article 15",
  },
  {
    id: 2,
    config_id: 7,
    question_text: "Which risk categories apply?",
    question_type: "multi_select" as const,
    options: ["Bias", "Safety", "Security"],
    is_required: true,
    is_system_default: false,
    allows_flag_for_concern: false,
    display_order: 2,
  },
  {
    id: 3,
    config_id: 7,
    question_text: "Describe any issues found:",
    question_type: "multi_line_text" as const,
    is_required: false,
    is_system_default: false,
    allows_flag_for_concern: false,
    display_order: 3,
  },
];

describe("MonitoringForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCycleById.mockResolvedValue(mockCycle);
    mockGetQuestions.mockResolvedValue(mockQuestions);
    mockGetResponses.mockResolvedValue([]);
    mockSaveResponses.mockResolvedValue(undefined);
    mockSubmitCycle.mockResolvedValue(undefined);
  });

  it("shows loading spinner initially", () => {
    mockGetCycleById.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MonitoringForm />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows not found when cycle is null", async () => {
    mockGetCycleById.mockResolvedValue(null);
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Monitoring cycle not found")).toBeInTheDocument();
    });
  });

  it("renders cycle header and status", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    expect(screen.getByText(/AI Chatbot/)).toBeInTheDocument();
    expect(screen.getByText(/Cycle #3/)).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Due date")).toBeInTheDocument();
    expect(screen.getByText("Completion")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders all question types", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    expect(screen.getByText("Is the model performing as expected?")).toBeInTheDocument();
    expect(screen.getByText("Which risk categories apply?")).toBeInTheDocument();
    expect(screen.getByText("Describe any issues found:")).toBeInTheDocument();

    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Bias")).toBeInTheDocument();
    expect(screen.getByText("Safety")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();

    const textareas = screen.getAllByTestId("field");
    expect(textareas.length).toBeGreaterThan(0);
  });

  it("shows asterisk for required questions", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    expect(screen.getAllByText("*").length).toBeGreaterThan(0);
  });

  it("shows EU AI Act article when present", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    expect(screen.getByText("Article 15")).toBeInTheDocument();
  });

  it("shows flag button on questions that allow it", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const flagButtons = screen.getAllByText("Flag concern");
    expect(flagButtons.length).toBe(1);
  });

  it("toggles flag on click", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const flagButton = screen.getByText("Flag concern");
    fireEvent.click(flagButton);

    const flagButtonsAfter = screen.getAllByText("Flag concern");
    expect(flagButtonsAfter.length).toBe(1);
  });

  it("shows suggestion text when No is selected for yes_no question", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const noRadio = screen.getByLabelText("No");
    fireEvent.click(noRadio);

    expect(screen.getByText("If not, consider retraining the model.")).toBeInTheDocument();
  });

  it("updates multi-select checkboxes", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const biasCheckbox = screen.getByLabelText("Bias");
    fireEvent.click(biasCheckbox);

    expect(biasCheckbox).toBeChecked();
  });

  it("updates textarea value", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const textareas = screen.getAllByTestId("field");
    fireEvent.change(textareas[0], { target: { value: "Some issues found" } });

    expect(textareas[0]).toHaveValue("Some issues found");
  });

  it("renders save draft and submit buttons", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    expect(screen.getByText("Save draft")).toBeInTheDocument();
    expect(screen.getByText("Submit")).toBeInTheDocument();
  });

  it("calls saveResponses when save draft is clicked", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const noRadio = screen.getByLabelText("No");
    fireEvent.click(noRadio);

    fireEvent.click(screen.getByText("Save draft"));

    await waitFor(() => {
      expect(mockSaveResponses).toHaveBeenCalledWith(42, [
        { question_id: 1, response_value: false, is_flagged: false },
      ]);
    });
  });

  it("shows error alert when submitting with missing required questions", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByTestId("alert")).toBeInTheDocument();
    });

    expect(screen.getByTestId("alert")).toHaveAttribute("data-variant", "error");
    expect(screen.getByText(/Please answer all required questions/)).toBeInTheDocument();
  });

  it("submits successfully when all required questions are answered", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const yesRadio = screen.getByLabelText("Yes");
    fireEvent.click(yesRadio);

    const biasCheckbox = screen.getByLabelText("Bias");
    fireEvent.click(biasCheckbox);

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(mockSubmitCycle).toHaveBeenCalled();
    });

    expect(mockSubmitCycle).toHaveBeenCalledWith(42, {
      responses: expect.arrayContaining([
        expect.objectContaining({ question_id: 1, response_value: true }),
        expect.objectContaining({ question_id: 2, response_value: ["Bias"] }),
      ]),
    });
  });

  it("shows success alert and navigates back after submit", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const yesRadio = screen.getByLabelText("Yes");
    fireEvent.click(yesRadio);

    const biasCheckbox = screen.getByLabelText("Bias");
    fireEvent.click(biasCheckbox);

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Monitoring cycle completed successfully")).toBeInTheDocument();
    });

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith(-1);
      },
      { timeout: 2000 },
    );
  });

  it("shows completed banner and no questions when cycle is completed", async () => {
    mockGetCycleById.mockResolvedValue({
      ...mockCycle,
      status: "completed",
      completed_at: "2026-06-01T00:00:00Z",
      completed_by_name: "John Doe",
    });

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText(/This monitoring cycle was completed on/)).toBeInTheDocument();
    });

    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.queryByText("Is the model performing as expected?")).not.toBeInTheDocument();
    expect(screen.queryByText("Save draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Submit")).not.toBeInTheDocument();
  });

  it("shows overdue status when cycle is overdue", async () => {
    mockGetCycleById.mockResolvedValue({
      ...mockCycle,
      is_overdue: true,
    });

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Overdue")).toBeInTheDocument();
    });
  });

  it("loads existing responses when available", async () => {
    mockGetResponses.mockResolvedValue([
      { question_id: 1, response_value: true, is_flagged: true },
      { question_id: 3, response_value: "Some notes", is_flagged: false },
    ]);

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Some notes")).toBeInTheDocument();
  });

  it("shows breadcrumbs", async () => {
    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByTestId("page-breadcrumbs")).toBeInTheDocument();
    });
  });

  it("shows not found when API fails to load", async () => {
    mockGetCycleById.mockRejectedValue(new Error("Network error"));

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Monitoring cycle not found")).toBeInTheDocument();
    });
  });

  it("shows warning when save draft fails", async () => {
    mockSaveResponses.mockRejectedValue(new Error("Save failed"));

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const noRadio = screen.getByLabelText("No");
    fireEvent.click(noRadio);

    fireEvent.click(screen.getByText("Save draft"));

    await waitFor(() => {
      expect(
        screen.getByText("Draft could not be saved. Your changes may not be preserved."),
      ).toBeInTheDocument();
    });
  });

  it("shows error alert when submit fails", async () => {
    mockSubmitCycle.mockRejectedValue({
      response: { data: { message: "Validation failed" } },
    });

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const yesRadio = screen.getByLabelText("Yes");
    fireEvent.click(yesRadio);

    const biasCheckbox = screen.getByLabelText("Bias");
    fireEvent.click(biasCheckbox);

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Validation failed")).toBeInTheDocument();
    });
  });

  it("disables buttons while saving", async () => {
    mockSaveResponses.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const noRadio = screen.getByLabelText("No");
    fireEvent.click(noRadio);

    fireEvent.click(screen.getByText("Save draft"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    const buttons = screen.getAllByTestId("customizable-button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("disables buttons while submitting", async () => {
    mockSubmitCycle.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<MonitoringForm />);

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });

    const yesRadio = screen.getByLabelText("Yes");
    fireEvent.click(yesRadio);

    const biasCheckbox = screen.getByLabelText("Bias");
    fireEvent.click(biasCheckbox);

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Submitting...")).toBeInTheDocument();
    });

    const buttons = screen.getAllByTestId("customizable-button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
