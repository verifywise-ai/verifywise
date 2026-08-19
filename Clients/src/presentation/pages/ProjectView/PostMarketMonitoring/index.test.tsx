import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockGetConfigByProjectId = vi.fn();
const mockCreateConfig = vi.fn();
const mockUpdateConfig = vi.fn();
const mockGetQuestions = vi.fn();
const mockAddQuestion = vi.fn();
const mockUpdateQuestion = vi.fn();
const mockDeleteQuestion = vi.fn();
const mockReorderQuestions = vi.fn();

vi.mock("../../../../infrastructure/api/postMarketMonitoringService", () => ({
  pmmService: {
    getConfigByProjectId: (...args: any[]) => mockGetConfigByProjectId(...args),
    createConfig: (...args: any[]) => mockCreateConfig(...args),
    updateConfig: (...args: any[]) => mockUpdateConfig(...args),
    getQuestions: (...args: any[]) => mockGetQuestions(...args),
    addQuestion: (...args: any[]) => mockAddQuestion(...args),
    updateQuestion: (...args: any[]) => mockUpdateQuestion(...args),
    deleteQuestion: (...args: any[]) => mockDeleteQuestion(...args),
    reorderQuestions: (...args: any[]) => mockReorderQuestions(...args),
  },
}));

vi.mock("../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [{ id: 1, name: "Jane", surname: "Doe" }] }),
}));

vi.mock("../../../../application/hooks/useProjectData", () => ({
  default: () => ({ project: { project_title: "Chatbot Assistant" } }),
}));

let mockUserRoleName = "Admin";
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: mockUserRoleName }),
}));

import PostMarketMonitoring from "./index";

const baseConfig = {
  id: 1,
  project_id: 1,
  is_active: true,
  frequency_value: 30,
  frequency_unit: "days",
  start_date: null,
  reminder_days: 3,
  escalation_days: 7,
  escalation_contact_id: undefined,
  notification_hour: 9,
};

const questions = [
  {
    id: 1,
    config_id: 1,
    question_text: "Is the model still accurate?",
    question_type: "yes_no",
    options: [],
    is_required: true,
    is_system_default: true,
    allows_flag_for_concern: true,
    display_order: 0,
    eu_ai_act_article: "Article 9",
  },
  {
    id: 2,
    config_id: 1,
    question_text: "Any new incidents?",
    question_type: "multi_line_text",
    options: [],
    is_required: false,
    is_system_default: false,
    allows_flag_for_concern: false,
    display_order: 1,
  },
];

describe("PostMarketMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleName = "Admin";
    mockGetConfigByProjectId.mockResolvedValue(baseConfig);
    mockGetQuestions.mockResolvedValue(questions);
  });

  it("shows a loading spinner while config loads", () => {
    mockGetConfigByProjectId.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<PostMarketMonitoring />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the toggle and use case title once loaded", async () => {
    renderWithProviders(<PostMarketMonitoring />, { route: "/project-view?projectId=1" });

    await waitFor(() => {
      expect(screen.getByText("Post-market monitoring")).toBeInTheDocument();
    });
    expect(screen.getByText(/Chatbot Assistant/)).toBeInTheDocument();
  });

  it("does not fetch questions when no config exists yet (404)", async () => {
    mockGetConfigByProjectId.mockRejectedValue({ response: { status: 404 } });
    renderWithProviders(<PostMarketMonitoring />);

    await waitFor(() => expect(mockGetConfigByProjectId).toHaveBeenCalled());
    expect(mockGetQuestions).not.toHaveBeenCalled();
    expect(screen.queryByText("Monitoring schedule")).not.toBeInTheDocument();
  });

  it("shows an error alert when loading config fails with a non-404 error", async () => {
    mockGetConfigByProjectId.mockRejectedValue({ response: { status: 500 } });
    renderWithProviders(<PostMarketMonitoring />);

    expect(await screen.findByText("Failed to load monitoring configuration")).toBeInTheDocument();
  });

  it("renders the questions list with default and required badges", async () => {
    renderWithProviders(<PostMarketMonitoring />);

    expect(await screen.findByText(/Is the model still accurate\?/)).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText(/Any new incidents\?/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no questions", async () => {
    mockGetQuestions.mockResolvedValue([]);
    renderWithProviders(<PostMarketMonitoring />);

    expect(
      await screen.findByText("No questions configured. Add questions to start monitoring."),
    ).toBeInTheDocument();
  });

  it("saves the schedule configuration when 'Save configuration' is clicked", async () => {
    mockUpdateConfig.mockResolvedValue(undefined);
    renderWithProviders(<PostMarketMonitoring />);

    await screen.findByText("Monitoring schedule");
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ frequency_value: 30, frequency_unit: "days" }),
      );
    });
    expect(await screen.findByText("Configuration saved successfully")).toBeInTheDocument();
  });

  it("toggles monitoring off and updates the existing config", async () => {
    mockUpdateConfig.mockResolvedValue(undefined);
    renderWithProviders(<PostMarketMonitoring />);

    await screen.findByText("Monitoring schedule");
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith(1, { is_active: false });
    });
    expect(await screen.findByText("Post-market monitoring disabled")).toBeInTheDocument();
  });

  it("creates a new config and loads default questions when enabling for the first time", async () => {
    mockGetConfigByProjectId.mockResolvedValue({ ...baseConfig, id: undefined, is_active: false });
    mockCreateConfig.mockResolvedValue({ ...baseConfig, id: 99 });
    mockGetQuestions.mockResolvedValue(questions);
    renderWithProviders(<PostMarketMonitoring />);

    await waitFor(() => expect(mockGetConfigByProjectId).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockCreateConfig).toHaveBeenCalled();
    });
    expect(await screen.findByText("Post-market monitoring enabled")).toBeInTheDocument();
  });

  it("deletes a question when the delete control is activated", async () => {
    mockDeleteQuestion.mockResolvedValue(undefined);
    renderWithProviders(<PostMarketMonitoring />);

    await screen.findByText(/Any new incidents\?/);
    fireEvent.click(screen.getByRole("button", { name: "Delete question" }));

    await waitFor(() => {
      expect(mockDeleteQuestion).toHaveBeenCalledWith(2);
    });
    expect(await screen.findByText("Question deleted")).toBeInTheDocument();
  });

  it("opens the question editor to add a new question and saves it", async () => {
    mockAddQuestion.mockResolvedValue({
      id: 3,
      config_id: 1,
      question_text: "New question",
      question_type: "yes_no",
      options: [],
      is_required: true,
      is_system_default: false,
      allows_flag_for_concern: true,
      display_order: 2,
    });
    renderWithProviders(<PostMarketMonitoring />);

    await screen.findByText("Monitoring questions");
    fireEvent.click(screen.getByRole("button", { name: /add question/i }));

    expect(await screen.findByRole("heading", { name: "Add question" })).toBeInTheDocument();

    fireEvent.change(document.querySelector("#question-text")!, {
      target: { value: "New question" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Add" })[0]);

    await waitFor(() => {
      expect(mockAddQuestion).toHaveBeenCalled();
    });
    expect(await screen.findByText("Question added")).toBeInTheDocument();
  });

  it("opens the question editor pre-filled when editing an existing question", async () => {
    renderWithProviders(<PostMarketMonitoring />);

    await screen.findByText(/Is the model still accurate\?/);
    const editButtons = screen.getAllByRole("button", { name: "Edit question" });
    fireEvent.click(editButtons[0]);

    expect(await screen.findByText("Edit question")).toBeInTheDocument();
  });

  it("disables the toggle for users without edit permissions", async () => {
    mockUserRoleName = "Auditor";
    renderWithProviders(<PostMarketMonitoring />);

    await screen.findByText("Monitoring schedule");
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getAllByText("View only").length).toBeGreaterThan(0);
  });
});
