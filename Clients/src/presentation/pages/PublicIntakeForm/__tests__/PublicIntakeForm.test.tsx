import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "../index";
import { getPublicFormById } from "../../../../application/repository/intakeForm.repository";

vi.mock("../../../../application/repository/intakeForm.repository", () => ({
  getPublicForm: vi.fn().mockResolvedValue({ data: null }),
  getPublicFormById: vi.fn(),
  submitPublicForm: vi.fn(),
  submitPublicFormById: vi.fn(),
  FormSchema: {},
  IntakeEntityType: { USE_CASE: "use_case", MODEL: "model" },
}));

vi.mock("../FormFieldRenderer", () => ({
  FormFieldRenderer: () => <div data-testid="form-field-renderer" />,
  FormFieldHint: ({ text }: { text?: string }) => (text ? <p>{text}</p> : null),
}));

vi.mock("../MathCaptcha", () => ({
  MathCaptcha: () => <div data-testid="math-captcha" />,
}));

const mockedGetPublicFormById = vi.mocked(getPublicFormById);

const mockForm = {
  id: 1,
  name: "Vendor intake",
  description: "Tell us about the vendor",
  slug: "vendor-intake",
  entityType: "use_case",
  schema: { version: "1", fields: [] },
  submitButtonText: "Submit",
};

function renderForm(route = "/abc123/use-case-form-intake") {
  return renderWithProviders(
    <Routes>
      <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
    </Routes>,
    { route },
  );
}

describe("PublicIntakeForm Page", () => {
  beforeEach(() => {
    mockedGetPublicFormById.mockReset();
    mockedGetPublicFormById.mockResolvedValue({
      data: { form: mockForm },
    } as Awaited<ReturnType<typeof getPublicFormById>>);
  });

  it("renders a main landmark and the form title as h1", async () => {
    renderForm();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Vendor intake" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Your contact information" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByText("We'll send you updates about your submission")).toBeInTheDocument();
  });

  it("uses a main landmark and h1 when the form cannot be loaded", async () => {
    mockedGetPublicFormById.mockRejectedValue(new Error("not found"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderForm();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Form unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
