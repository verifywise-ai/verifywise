import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock hooks
vi.mock("../../../../application/hooks/useAssessmentProgress", () => ({
  default: () => ({
    assessmentProgress: { totalQuestions: 10, answeredQuestions: 5 },
    loading: false,
  }),
}));

vi.mock("../../../../application/hooks/useAssessmentTopcis", () => ({
  default: () => ({
    assessmentTopics: [
      { id: 1, title: "Topic 1" },
      { id: 2, title: "Topic 2" },
    ],
    loading: false,
  }),
}));

vi.mock("../../../../application/hooks/useAssessmentSubtopics", () => ({
  default: () => ({
    assessmentSubtopics: [
      {
        id: 1,
        title: "Subtopic 1",
        questions: [{ question_id: 1, question: "Question 1", status: "done" }],
      },
    ],
    loading: false,
  }),
}));

vi.mock("../../../../application/hooks/useMultipleOnScreen", () => ({
  default: () => ({
    refs: [{ current: null }, { current: null }],
    allVisible: false,
  }),
}));

// Mock child components
vi.mock("../../../components/Cards/StatsCard", () => ({
  StatsCard: () => <div data-testid="stats-card" />,
}));

vi.mock("../../../components/Skeletons", () => ({
  default: () => <div data-testid="skeleton" />,
}));

vi.mock("../1.0AssessmentTracker/AccordionView", () => ({
  default: () => <div data-testid="accordion-view" />,
}));

vi.mock("../../../components/Drawer/EUAIActQuestionDrawerDialog", () => ({
  default: () => <div data-testid="question-drawer" />,
}));

vi.mock("../../../components/PageTour", () => ({
  default: () => null,
}));

vi.mock("../1.0AssessmentTracker/AssessmentSteps", () => ({
  default: [],
}));

import AssessmentTracker from "../1.0AssessmentTracker/index";

const mockProject = {
  id: 1,
  project_title: "Test Project",
  framework: [{ framework_id: 1, project_framework_id: 100 }],
};

describe("AssessmentTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = renderWithProviders(<AssessmentTracker project={mockProject as any} />);
    expect(container).toBeTruthy();
  });
});
