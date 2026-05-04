import { renderWithProviders } from "../../../../test/renderWithProviders";
import { IntakeFormBuilder } from "../index";

// Mock repository functions
vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getIntakeForm: vi.fn().mockResolvedValue({ data: null }),
  createIntakeForm: vi.fn().mockResolvedValue({ data: {} }),
  updateIntakeForm: vi.fn().mockResolvedValue({ data: {} }),
  IntakeFormStatus: {
    DRAFT: "draft",
    ACTIVE: "active",
    ARCHIVED: "archived",
  },
  IntakeEntityType: {
    USE_CASE: "use_case",
    MODEL: "model",
  },
}));

// Mock CustomAxios for LLM keys and users loading
vi.mock("../../../../infrastructure/api/customAxios", () => ({
  __esModule: true,
  default: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock child components to isolate the page
vi.mock("../FieldPalette", () => ({
  FieldPalette: () => <div data-testid="field-palette" />,
  SuggestedQuestionsPanel: () => <div data-testid="suggested-questions" />,
  SuggestedQuestionsPanelHandle: {},
}));

vi.mock("../FormCanvas", () => ({
  FormCanvas: () => <div data-testid="form-canvas" />,
  FormCanvasHandle: {},
}));

vi.mock("../FieldEditor", () => ({
  FieldEditor: () => <div data-testid="field-editor" />,
}));

vi.mock("../DesignPanel", () => ({
  DesignPanel: () => <div data-testid="design-panel" />,
}));

describe("IntakeFormBuilder Page", () => {
  it("renders without crashing for a new form", () => {
    const { container } = renderWithProviders(<IntakeFormBuilder />, {
      route: "/intake-forms/new/edit",
    });

    expect(container).toBeInTheDocument();
  });
});
