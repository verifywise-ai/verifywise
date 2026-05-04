import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "../index";

// Mock the repository functions
vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getPublicForm: vi.fn().mockResolvedValue({ data: null }),
  getPublicFormById: vi.fn().mockResolvedValue({ data: null }),
  submitPublicForm: vi.fn(),
  submitPublicFormById: vi.fn(),
  FormSchema: {},
  IntakeEntityType: { USE_CASE: "use_case", MODEL: "model" },
}));

// Mock child components that are non-trivial
vi.mock("../FormFieldRenderer", () => ({
  FormFieldRenderer: () => <div data-testid="form-field-renderer" />,
}));

vi.mock("../MathCaptcha", () => ({
  MathCaptcha: () => <div data-testid="math-captcha" />,
}));

describe("PublicIntakeForm Page", () => {
  it("renders without crashing", () => {
    const { container } = renderWithProviders(<PublicIntakeForm />, {
      route: "/abc123/use-case-form-intake",
    });

    expect(container).toBeInTheDocument();
  });
});
