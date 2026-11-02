import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { PublicIntakeForm } from "../index";
import {
  getPublicFormById,
  submitPublicFormById,
} from "../../../../application/repository/intakeForm.repository";

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
  MathCaptcha: ({ onChange }: { onChange: (value: string, token: string) => void }) => (
    <input data-testid="math-captcha" onChange={(e) => onChange(e.target.value, "token")} />
  ),
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
    vi.mocked(submitPublicFormById).mockReset();
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
    expect(screen.getByTestId("public-form-submit")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("public-preview-banner-dismiss"));
    expect(screen.queryByTestId("public-preview-banner")).not.toBeInTheDocument();
  });

  // Fill what the page itself checks before sending: contact email and captcha.
  const fillRequired = () => {
    fireEvent.change(document.getElementById("submitter-email") as HTMLInputElement, {
      target: { value: "builder@example.com" },
    });
    fireEvent.change(screen.getByTestId("math-captcha"), { target: { value: "7" } });
  };

  it("tests a submit without sending anything", async () => {
    renderForm("/abc123/use-case-form-intake?vwPreview=1&as=submitter");
    await screen.findByTestId("public-preview-banner");
    fillRequired();
    fireEvent.click(screen.getByTestId("public-form-submit"));
    fireEvent.click(await screen.findByText("Test submit"));
    expect(await screen.findByTestId("preview-test-submit-passed")).toHaveTextContent(
      "Nothing was sent.",
    );
    expect(submitPublicFormById).not.toHaveBeenCalled();
    // Any change afterwards clears the result.
    fireEvent.change(screen.getByTestId("math-captcha"), { target: { value: "8" } });
    expect(screen.queryByTestId("preview-test-submit-passed")).not.toBeInTheDocument();
  });

  it("submits for real only when that is chosen", async () => {
    vi.mocked(submitPublicFormById).mockResolvedValue({
      data: { submissionId: 1, resubmissionToken: "t" },
    } as never);
    renderForm("/abc123/use-case-form-intake?vwPreview=1&as=submitter");
    await screen.findByTestId("public-preview-banner");
    fillRequired();
    fireEvent.click(screen.getByTestId("public-form-submit"));
    expect(submitPublicFormById).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByText("Submit for real"));
    await waitFor(() => expect(submitPublicFormById).toHaveBeenCalledTimes(1));
  });

  // Enter clicks the submit button, which opens the menu; a form submit that
  // bypasses the button only runs a test.
  it("only tests on a form submit that bypasses the menu in a preview", async () => {
    renderForm("/abc123/use-case-form-intake?vwPreview=1&as=submitter");
    await screen.findByTestId("public-preview-banner");
    fillRequired();
    fireEvent.submit(document.getElementById("submitter-email")!.closest("form")!);
    expect(await screen.findByTestId("preview-test-submit-passed")).toBeInTheDocument();
    expect(submitPublicFormById).not.toHaveBeenCalled();
  });

  it("keeps a plain submit button for a normal visitor", async () => {
    renderForm("/abc123/use-case-form-intake");
    await screen.findByText("Vendor intake");
    expect(screen.getByTestId("public-form-submit")).toHaveAttribute("type", "submit");
    fireEvent.click(screen.getByTestId("public-form-submit"));
    expect(screen.queryByTestId("preview-submit-menu")).not.toBeInTheDocument();
  });
});
