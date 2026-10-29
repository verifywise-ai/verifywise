import { fireEvent, screen } from "@testing-library/react";
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
  FieldLabel: ({ label, htmlFor }: { label: string; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{label}</label>
  ),
}));

vi.mock("../MathCaptcha", () => ({
  MathCaptcha: () => <div data-testid="math-captcha" />,
}));

const renderForm = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/:publicId/use-case-form-intake" element={<PublicIntakeForm />} />
    </Routes>,
    { route },
  );

describe("PublicIntakeForm builder preview", () => {
  beforeEach(() => {
    vi.mocked(getPublicFormById).mockResolvedValue({
      data: {
        form: {
          id: 1,
          name: "Vendor intake",
          description: "",
          slug: "vendor-intake",
          entityType: "use_case",
          schema: { version: "1", fields: [] },
          submitButtonText: "Submit",
        },
      },
    } as Awaited<ReturnType<typeof getPublicFormById>>);
  });

  it("shows no preview notice to a normal visitor", async () => {
    renderForm("/abc123/use-case-form-intake");
    expect(await screen.findByText("Vendor intake")).toBeInTheDocument();
    expect(screen.queryByTestId("public-preview-banner")).not.toBeInTheDocument();
  });

  it("shows no notice for any other value of the param", async () => {
    renderForm("/abc123/use-case-form-intake?vwPreview=true&as=admin");
    expect(await screen.findByText("Vendor intake")).toBeInTheDocument();
    expect(screen.queryByTestId("public-preview-banner")).not.toBeInTheDocument();
  });

  it("shows a dismissible notice when opened from the builder", async () => {
    renderForm("/abc123/use-case-form-intake?vwPreview=1&as=submitter");
    expect(await screen.findByTestId("public-preview-banner")).toHaveTextContent(
      "Previewing as a submitter",
    );
    // The form itself is unchanged.
    expect(screen.getByRole("button", { name: /Submit/ })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("public-preview-banner-dismiss"));
    expect(screen.queryByTestId("public-preview-banner")).not.toBeInTheDocument();
  });
});
